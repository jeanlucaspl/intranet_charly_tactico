#!/usr/bin/env python3
"""
omr_server.py — Servidor OMR para Charly Táctico
Recibe imagen de cartilla desde el celular, procesa con OpenCV y retorna respuestas.

Uso:
    pip install flask flask-cors opencv-python numpy
    python omr_server.py

El celular y la PC deben estar en la misma red WiFi.
"""

import os
import socket
import numpy as np
import cv2
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
CORS(app)

# ── Constantes de layout (idénticas a CART_LAYOUT en admin.html) ──
CL = {
    'GX': 10, 'GY': 36, 'GW': 190, 'GH': 200,
    'RM': 5,  'HDR': 6,  'RH': 7,  'QW': 8,
    'BA': 11, 'BS': 6.5, 'BR': 2.5, 'GAP': 5,
}

# Marcas de registro en esquinas del papel A4 (3mm del borde, 7x7mm)
# Centro de cada marca en mm (TL, TR, BL, BR)
MK_M, MK_S = 3.0, 7.0
REG_MM = [
    (MK_M + MK_S/2,        MK_M + MK_S/2),         # TL: (6.5,   6.5)
    (210 - MK_M - MK_S/2,  MK_M + MK_S/2),          # TR: (203.5, 6.5)
    (MK_M + MK_S/2,        297 - MK_M - MK_S/2),    # BL: (6.5,   290.5)
    (210 - MK_M - MK_S/2,  297 - MK_M - MK_S/2),    # BR: (203.5, 290.5)
]

# Resolución interna del warp (150 dpi sobre A4)
DPI      = 150
MM_TO_PX = DPI / 25.4
A4_W     = int(210 * MM_TO_PX)
A4_H     = int(297 * MM_TO_PX)

# Umbral relativo: burbuja marcada si su brillo < max_brillo_fila * FILL_RATIO
# Esto adapta automáticamente a diferentes condiciones de iluminación.
FILL_RATIO = 0.55


# ══════════════════════════════════════════════════════════════════
#  DETECCIÓN DE MARCAS DE REGISTRO
# ══════════════════════════════════════════════════════════════════

def find_registration_marks(gray: np.ndarray):
    """
    Detecta los 4 cuadrados negros 5×5 mm en las esquinas de la cartilla.
    Retorna lista [(cx, cy), ...] en píxeles, orden [TL, TR, BL, BR].
    Cada elemento puede ser None si no se encontró la marca.
    """
    H, W = gray.shape

    # Umbral adaptativo por bloques — tolera sombras y luz despareja
    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=51, C=10
    )

    # Eliminar ruido puntual
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Cuadrantes de búsqueda (28 % de cada lado)
    Z = 0.28
    quadrants = [
        (0,           0,           int(W * Z),       int(H * Z)),       # TL
        (int(W*(1-Z)), 0,          W,                int(H * Z)),       # TR
        (0,           int(H*(1-Z)), int(W * Z),      H),                # BL
        (int(W*(1-Z)), int(H*(1-Z)), W,              H),                # BR
    ]

    marks = []
    for (x0, y0, x1, y1) in quadrants:
        best      = None
        best_score = 0
        for cnt in contours:
            M = cv2.moments(cnt)
            if M['m00'] < 30:
                continue
            cx = M['m10'] / M['m00']
            cy = M['m01'] / M['m00']
            if not (x0 <= cx <= x1 and y0 <= cy <= y1):
                continue
            # No puede estar pegado al borde de la imagen
            if cx < 4 or cx > W - 4 or cy < 4 or cy > H - 4:
                continue
            area = cv2.contourArea(cnt)
            # Filtro de tamaño: marca de 7x7mm esperada según escala
            # A escala típica (papel llenando 70-100% del frame) → 200-15000 px²
            if area < 150 or area > 15000:
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            squareness = min(w, h) / max(w, h) if max(w, h) > 0 else 0
            if squareness < 0.3:   # descartar formas muy alargadas
                continue
            score = area * (squareness ** 2)
            if score > best_score:
                best_score = score
                best = (cx, cy)
        marks.append(best)

    return marks  # [TL, TR, BL, BR], puede tener None


# ══════════════════════════════════════════════════════════════════
#  CORRECCIÓN DE PERSPECTIVA
# ══════════════════════════════════════════════════════════════════

def warp_perspective(gray: np.ndarray, marks_px: list) -> np.ndarray:
    """
    Aplica warpPerspective usando las 4 marcas detectadas.
    Retorna imagen A4 a DPI interno (listo para muestrear burbujas).
    """
    src = np.float32([list(m) for m in marks_px])
    dst = np.float32([
        [m[0] * MM_TO_PX, m[1] * MM_TO_PX] for m in REG_MM
    ])
    H_mat  = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(gray, H_mat, (A4_W, A4_H),
                                  flags=cv2.INTER_LINEAR)
    return warped


# ══════════════════════════════════════════════════════════════════
#  MUESTREO DE BURBUJAS
# ══════════════════════════════════════════════════════════════════

def sample_bubble(warped: np.ndarray, cx_px: float, cy_px: float, r_px: float) -> float:
    """Brillo promedio dentro del círculo (0 = negro, 255 = blanco)."""
    mask = np.zeros(warped.shape[:2], dtype=np.uint8)
    cv2.circle(mask, (int(round(cx_px)), int(round(cy_px))), int(round(r_px)), 255, -1)
    mean_val = cv2.mean(warped, mask=mask)[0]
    return mean_val


# ══════════════════════════════════════════════════════════════════
#  OMR PRINCIPAL
# ══════════════════════════════════════════════════════════════════

def process_omr(warped: np.ndarray, N: int) -> list:
    """
    Detecta respuestas en la imagen ya corregida de perspectiva.

    Retorna lista de dicts:
        {q, detected, status, brights}

    status:
        'ok'       → una burbuja marcada con buena confianza
        'blank'    → ninguna burbuja marcada
        'double'   → dos o más burbujas marcadas
        'low_conf' → una burbuja oscura pero la diferencia es pequeña
    """
    N_GRP  = 1 if N <= 25 else 2 if N <= 50 else 3 if N <= 75 else 4
    CONT_W = CL['GW'] - 2 * CL['RM']
    GRP_W  = (CONT_W - (N_GRP - 1) * CL['GAP']) / N_GRP
    CX0    = CL['GX'] + CL['RM']

    b_rad_px = CL['BR'] * MM_TO_PX * 1.1
    LTRS = ['A', 'B', 'C', 'D']
    results = []

    for q in range(N):
        g   = q // 25
        row = q % 25
        gx_mm = CX0 + g * (GRP_W + CL['GAP'])
        cy_mm = CL['GY'] + CL['RM'] + CL['HDR'] + row * CL['RH'] + CL['RH'] / 2

        brights = []
        for c in range(4):
            bx_mm = gx_mm + CL['BA'] + c * CL['BS']
            b = sample_bubble(warped, bx_mm * MM_TO_PX, cy_mm * MM_TO_PX, b_rad_px)
            brights.append(round(b, 1))

        brightest    = max(brights)
        threshold    = brightest * FILL_RATIO
        chosen       = brights.index(min(brights))
        marked_idxs  = [i for i, b in enumerate(brights) if b < threshold]

        if len(marked_idxs) == 0:
            status, detected = 'blank', None
        elif len(marked_idxs) >= 2:
            status, detected = 'double', None
        else:
            status, detected = 'ok', LTRS[chosen]

        results.append({
            'q':        q + 1,
            'detected': detected,
            'status':   status,
            'brights':  brights,
        })

    return results


# ══════════════════════════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════════════════════════

def _save_debug(warped: np.ndarray, results: list, N: int):
    """Guarda imagen de debug con círculos sobre cada burbuja muestreada."""
    dbg = cv2.cvtColor(warped, cv2.COLOR_GRAY2BGR)

    N_GRP  = 1 if N <= 25 else 2 if N <= 50 else 3 if N <= 75 else 4
    CONT_W = CL['GW'] - 2 * CL['RM']
    GRP_W  = (CONT_W - (N_GRP - 1) * CL['GAP']) / N_GRP
    CX0    = CL['GX'] + CL['RM']
    b_rad_px = int(CL['BR'] * MM_TO_PX * 1.1)

    STATUS_COLOR = {
        'ok':       (0, 220, 80),    # verde
        'blank':    (60, 60, 220),   # rojo
        'double':   (0, 165, 255),   # naranja
        'low_conf': (0, 220, 220),   # amarillo
    }
    LTRS = ['A', 'B', 'C', 'D']

    for r in results:
        q   = r['q'] - 1
        g   = q // 25
        row = q % 25
        gx_mm = CX0 + g * (GRP_W + CL['GAP'])
        cy_mm = CL['GY'] + CL['RM'] + CL['HDR'] + row * CL['RH'] + CL['RH'] / 2
        color = STATUS_COLOR.get(r['status'], (200, 200, 200))

        for c in range(4):
            bx_mm = gx_mm + CL['BA'] + c * CL['BS']
            px = int(bx_mm * MM_TO_PX)
            py = int(cy_mm * MM_TO_PX)
            # Círculo fino en todas las burbujas
            cv2.circle(dbg, (px, py), b_rad_px, (180, 180, 180), 1)
            # Círculo grueso en la detectada
            if r['detected'] == LTRS[c]:
                cv2.circle(dbg, (px, py), b_rad_px, color, 2)
            # Número de pregunta al inicio de cada fila
            if c == 0:
                cv2.putText(dbg, str(r['q']), (px - b_rad_px - 18, py + 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.28, (120, 120, 120), 1)

    cv2.imwrite('/tmp/omr_debug.jpg', dbg)
    print(f"  Debug guardado en /tmp/omr_debug.jpg")


@app.route('/')
@app.route('/escaner_cartilla.html')
def scanner_page():
    return send_from_directory(BASE_DIR, 'escaner_cartilla.html')

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(BASE_DIR, 'favicon.ico')

@app.route('/icons/<path:filename>')
def icons(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'icons'), filename)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'ok': True, 'server': 'Charly Táctico OMR'})


@app.route('/process', methods=['POST'])
def process():
    if 'image' not in request.files:
        return jsonify({'error': 'No se recibió imagen'}), 400

    try:
        n = int(request.form.get('n', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'Parámetro n inválido'}), 400

    if n < 1 or n > 100:
        return jsonify({'error': f'n debe ser 1–100 (recibido: {n})'}), 400

    file_bytes = request.files['image'].read()
    np_arr = np.frombuffer(file_bytes, dtype=np.uint8)
    img    = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        return jsonify({'error': 'No se pudo decodificar la imagen'}), 400

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Detectar marcas de registro
    marks = find_registration_marks(gray)
    valid = [m for m in marks if m is not None]

    print(f"\n[OMR] Imagen: {gray.shape[1]}x{gray.shape[0]}px  N={n}")
    names = ['TL', 'TR', 'BL', 'BR']
    for i, m in enumerate(marks):
        print(f"  Marca {names[i]}: {f'({m[0]:.0f}, {m[1]:.0f})' if m else 'NO DETECTADA'}")

    if len(valid) < 4:
        missing = [names[i] for i, m in enumerate(marks) if m is None]
        return jsonify({
            'error': (
                f'Solo se detectaron {len(valid)}/4 marcas de registro '
                f'(faltan: {", ".join(missing)}). '
                f'Mejora la iluminación o ajusta el ángulo.'
            )
        }), 422

    # Corregir perspectiva
    warped = warp_perspective(gray, marks)

    # Detectar respuestas
    results = process_omr(warped, n)
    _save_debug(warped, results, n)

    # Resumen de detección
    counts = {'ok': 0, 'blank': 0, 'double': 0, 'low_conf': 0}
    for r in results:
        counts[r['status']] += 1
    print(f"  Resultados → ok:{counts['ok']}  blank:{counts['blank']}  double:{counts['double']}  low_conf:{counts['low_conf']}")
    # Mostrar brights de las primeras 10 preguntas para calibración
    for r in results[:10]:
        print(f"  Q{r['q']}: {r['status']} detected={r['detected']} brights={r['brights']}")

    return jsonify({'results': results})


# ══════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = '127.0.0.1'

    print(f"\n{'═' * 52}")
    print(f"  Charly Táctico · Servidor OMR")
    print(f"{'═' * 52}")
    print(f"  IP local  →  {local_ip}")
    print(f"  Endpoint  →  https://{local_ip}:5000")
    print(f"  Ingresa esa IP en el escáner del celular")
    print(f"{'═' * 52}\n")

    app.run(host='0.0.0.0', port=5000, ssl_context='adhoc', debug=False)
