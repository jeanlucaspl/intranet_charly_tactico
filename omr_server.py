#!/usr/bin/env python3
"""
omr_server.py — Servidor OMR para Charly Táctico
Pipeline: Gaussian Blur → Otsu threshold → warp perspectiva → conteo de píxeles oscuros

Uso:
    .venv/bin/python omr_server.py
    (Celular y PC en la misma WiFi)
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

# Marcas de registro en esquinas del papel A4 (3mm del borde, 7×7mm)
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

# Evaluación ArgMax: la burbuja con mayor densidad de píxeles oscuros gana.
# Blanco si max < BLANK_THRESH; doble si 2do/1ro >= DOUBLE_RATIO.
BLANK_PX      = 280    # máx burbuja debe superar esto para no ser blanco
MIN_MARK_GAP  = 80     # el ganador debe superar al 2do por ≥80px → respuesta clara
DOUBLE_MIN_PX = 350    # doble marca: el 2do también debe superar esto


# ══════════════════════════════════════════════════════════════════
#  PREPROCESAMIENTO
# ══════════════════════════════════════════════════════════════════

def enhance_contrast(gray: np.ndarray) -> np.ndarray:
    """CLAHE: mejora contraste local para cámaras de baja calidad."""
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)


def preprocess(gray: np.ndarray) -> np.ndarray:
    """
    Gaussian Blur → Otsu con umbral mínimo garantizado.
    Otsu funciona bien cuando hay marcas de lápiz (bimodal papel/lápiz).
    Si da umbral muy bajo (imagen casi uniforme sin marcas), forzamos 185
    para capturar lápiz (~140-185 gray) sin confundir papel (~200-240 gray).
    """
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    otsu_val, binary = cv2.threshold(blurred, 0, 255,
                                     cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if otsu_val < 170:
        _, binary = cv2.threshold(blurred, 185, 255, cv2.THRESH_BINARY_INV)
        otsu_val = 185
    print(f"  Umbral binario: {otsu_val:.0f}")
    return binary


# ══════════════════════════════════════════════════════════════════
#  DETECCIÓN DE MARCAS DE REGISTRO
# ══════════════════════════════════════════════════════════════════

def find_registration_marks(gray: np.ndarray):
    """
    Detecta los 4 cuadros negros 7×7mm en las esquinas del papel.
    Procesa cada cuadrante con su propio Otsu local (evita bias del fondo oscuro).
    Retorna [(cx, cy), ...] en píxeles, orden [TL, TR, BL, BR].
    """
    H, W = gray.shape
    # Imagen ya recortada al papel. Marcas a ~3% del borde, burbujas desde ~13%.
    # Z=0.09 cubre solo la esquina real (~19mm en A4), lejos del área de burbujas.
    Z = 0.12
    quadrants = [
        (0,            0,            int(W * Z),       int(H * Z)),   # TL
        (int(W*(1-Z)), 0,            W,                int(H * Z)),   # TR
        (0,            int(H*(1-Z)), int(W * Z),       H),            # BL
        (int(W*(1-Z)), int(H*(1-Z)), W,                H),            # BR
    ]
    # Esquina de imagen de referencia para cada cuadrante (para penalizar distancia)
    corners = [(0, 0), (W, 0), (0, H), (W, H)]
    names_q = ['TL', 'TR', 'BL', 'BR']
    kernel  = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))

    marks = []
    for qi, (x0, y0, x1, y1) in enumerate(quadrants):
        # ── CLAHE + Otsu LOCAL por cuadrante ─────────────────────
        crop    = enhance_contrast(gray[y0:y1, x0:x1])
        blurred = cv2.GaussianBlur(crop, (5, 5), 0)
        _, bin_crop = cv2.threshold(blurred, 0, 255,
                                    cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        bin_crop = cv2.morphologyEx(bin_crop, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(bin_crop, cv2.RETR_EXTERNAL,
                                        cv2.CHAIN_APPROX_SIMPLE)

        # Tamaño esperado de la marca: ~7mm sobre imagen que representa 210mm de ancho
        expected_area = (W * 7 / 210) ** 2   # píxeles²
        cx_ref, cy_ref = corners[qi]          # esquina de referencia

        best, best_score = None, 0
        top_cands = []

        # Margen de borde: la marca real está a ~6% del borde; excluir objetos al 4%
        edge_x = W * 0.04
        edge_y = H * 0.04

        for cnt in contours:
            M = cv2.moments(cnt)
            if M['m00'] < 20:
                continue
            cx_c = M['m10'] / M['m00']
            cy_c = M['m01'] / M['m00']
            # Coords en imagen completa
            gx, gy = x0 + cx_c, y0 + cy_c
            # Excluir si está pegado al borde de la imagen (falsos positivos por aristas del papel)
            if gx < edge_x or gx > W - edge_x or gy < edge_y or gy > H - edge_y:
                continue
            area = cv2.contourArea(cnt)
            # Filtro de área: entre 20% y 400% del tamaño esperado de la marca
            if area < expected_area * 0.20 or area > expected_area * 4.0:
                continue
            bx, by, bw, bh = cv2.boundingRect(cnt)
            squareness = min(bw, bh) / max(bw, bh) if max(bw, bh) > 0 else 0
            if squareness < 0.40:
                continue
            # Distancia del centroide a la esquina
            dist = ((gx - cx_ref) ** 2 + (gy - cy_ref) ** 2) ** 0.5
            # Score: favorece cuadrado grande y CERCANO a la esquina
            score = area * (squareness ** 2) / (1.0 + dist / 15.0)
            top_cands.append((round(score, 1), round(area), round(squareness, 2),
                              round(cx_c), round(cy_c), round(dist)))
            if score > best_score:
                best_score = score
                best = (gx, gy)

        top_cands.sort(reverse=True)
        print(f"  {names_q[qi]}: {'OK ({:.0f},{:.0f}) score={:.1f}'.format(*best, best_score) if best else 'NO DETECTADA'}  "
              f"exp_area={expected_area:.0f}  top3={top_cands[:3]}")
        marks.append(best)

    return marks


# ══════════════════════════════════════════════════════════════════
#  CORRECCIÓN DE PERSPECTIVA
# ══════════════════════════════════════════════════════════════════

def warp_perspective(gray: np.ndarray, marks_px: list) -> np.ndarray:
    """
    Warpea la imagen EN GRIS (no binaria) usando las 4 marcas.
    Luego aplica adaptive threshold sobre el papel ya plano y limpio.
    Así se evita que sombras/bordes contaminen la binarización.
    """
    src = np.float32([list(m) for m in marks_px])
    dst = np.float32([
        [m[0] * MM_TO_PX, m[1] * MM_TO_PX] for m in REG_MM
    ])
    H_mat      = cv2.getPerspectiveTransform(src, dst)
    warped_gray = cv2.warpPerspective(gray, H_mat, (A4_W, A4_H),
                                      flags=cv2.INTER_LINEAR)
    # Adaptive threshold sobre papel plano: detecta lápiz claro y tinta oscura
    # por igual sin importar iluminación no uniforme de la foto.
    warped_bin = cv2.adaptiveThreshold(
        warped_gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=31, C=6
    )
    # Cierre morfológico: fusiona trazos finos del lapicero en masa sólida.
    # Kernel 7×7 elipse: cierra huecos sin fusionar burbujas adyacentes.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    warped_bin = cv2.morphologyEx(warped_bin, cv2.MORPH_CLOSE, kernel)
    return warped_bin


# ══════════════════════════════════════════════════════════════════
#  CONTEO DE PÍXELES OSCUROS EN BURBUJA
# ══════════════════════════════════════════════════════════════════

def count_filled_px(warped_bin: np.ndarray, cx_px: float, cy_px: float, r_px: float) -> int:
    """
    Cantidad absoluta de píxeles oscuros (=255 en binario invertido) dentro del círculo.
    Usado para ArgMax: burbuja con más píxeles = respuesta elegida.
    """
    mask = np.zeros(warped_bin.shape, dtype=np.uint8)
    cv2.circle(mask, (int(round(cx_px)), int(round(cy_px))), int(round(r_px)), 255, -1)
    return cv2.countNonZero(cv2.bitwise_and(warped_bin, mask))


# ══════════════════════════════════════════════════════════════════
#  OMR PRINCIPAL
# ══════════════════════════════════════════════════════════════════

def process_omr(warped_bin: np.ndarray, N: int) -> list:
    """
    Detecta respuestas con lógica ArgMax (Evaluación Relativa).
    Para cada pregunta: cuenta píxeles oscuros en cada burbuja y elige la mayor.
    status: 'ok' | 'blank' | 'double'
    counts: píxeles oscuros de cada burbuja [A, B, C, D]
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

        counts = []
        for c in range(4):
            bx_mm = gx_mm + CL['BA'] + c * CL['BS']
            px_count = count_filled_px(warped_bin,
                                       bx_mm * MM_TO_PX,
                                       cy_mm * MM_TO_PX,
                                       b_rad_px)
            counts.append(px_count)

        max_px = max(counts)
        chosen = counts.index(max_px)

        if max_px < BLANK_PX:
            # Ninguna burbuja supera el ruido del borde impreso → blanco
            status, detected = 'blank', None
        else:
            sorted_c = sorted(counts, reverse=True)
            gap = sorted_c[0] - sorted_c[1]
            if gap >= MIN_MARK_GAP:
                # Ganador claro: supera al 2do por ≥100px
                status, detected = 'ok', LTRS[chosen]
            elif sorted_c[1] >= DOUBLE_MIN_PX:
                # Dos burbujas claramente marcadas y muy similares → doble marca
                status, detected = 'double', None
            else:
                # Max ≥300 pero gap pequeño y 2do bajo → ruido del borde → blanco
                status, detected = 'blank', None

        results.append({
            'q':        q + 1,
            'detected': detected,
            'status':   status,
            'counts':   counts,   # píxeles absolutos por burbuja
        })

    return results


# ══════════════════════════════════════════════════════════════════
#  DEBUG
# ══════════════════════════════════════════════════════════════════

def _save_marks_debug(gray: np.ndarray, marks: list):
    H, W = gray.shape
    dbg  = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    Z    = 0.40
    zones = [
        (0,            0,            int(W*Z),   int(H*Z)),
        (int(W*(1-Z)), 0,            W-1,        int(H*Z)),
        (0,            int(H*(1-Z)), int(W*Z),   H-1),
        (int(W*(1-Z)), int(H*(1-Z)), W-1,        H-1),
    ]
    for (x0, y0, x1, y1) in zones:
        cv2.rectangle(dbg, (x0, y0), (x1, y1), (200, 100, 0), 2)
    names = ['TL', 'TR', 'BL', 'BR']
    for i, m in enumerate(marks):
        if m:
            cv2.circle(dbg, (int(m[0]), int(m[1])), 20, (0, 230, 0), 3)
            cv2.putText(dbg, names[i], (int(m[0])+22, int(m[1])+6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 230, 0), 2)
    cv2.imwrite('/tmp/omr_marks.jpg', dbg)
    print("  Diagnóstico marcas → /tmp/omr_marks.jpg")


def _save_debug(warped_bin: np.ndarray, results: list, N: int):
    dbg = cv2.cvtColor(warped_bin, cv2.COLOR_GRAY2BGR)
    N_GRP  = 1 if N <= 25 else 2 if N <= 50 else 3 if N <= 75 else 4
    CONT_W = CL['GW'] - 2 * CL['RM']
    GRP_W  = (CONT_W - (N_GRP - 1) * CL['GAP']) / N_GRP
    CX0    = CL['GX'] + CL['RM']
    b_rad_px = int(CL['BR'] * MM_TO_PX * 1.1)
    STATUS_COLOR = {
        'ok': (0, 220, 80), 'blank': (60, 60, 220),
        'double': (0, 165, 255), 'low_conf': (0, 220, 220),
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
            cv2.circle(dbg, (px, py), b_rad_px, (180, 180, 180), 1)
            if r['detected'] == LTRS[c]:
                cv2.circle(dbg, (px, py), b_rad_px, color, 2)
            if c == 0:
                cv2.putText(dbg, str(r['q']), (px - b_rad_px - 18, py + 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.28, (120, 120, 120), 1)
    cv2.imwrite('/tmp/omr_debug.jpg', dbg)
    print("  Debug burbujas → /tmp/omr_debug.jpg")


# ══════════════════════════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════════════════════════

@app.route('/')
@app.route('/escaner_cartilla.html')
def scanner_page():
    resp = send_from_directory(BASE_DIR, 'escaner_cartilla.html')
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    return resp

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

    # Canal rojo (BGR índice 2): lapicero azul absorbe luz roja → aparece negro puro.
    # Mucho mejor contraste que escala de grises para tinta azul.
    gray  = img[:, :, 2]

    marks = find_registration_marks(gray)
    valid = [m for m in marks if m is not None]

    print(f"\n[OMR] Imagen: {gray.shape[1]}x{gray.shape[0]}px  N={n}")
    names = ['TL', 'TR', 'BL', 'BR']
    for i, m in enumerate(marks):
        print(f"  Marca {names[i]}: {f'({m[0]:.0f}, {m[1]:.0f})' if m else 'NO DETECTADA'}")
    _save_marks_debug(gray, marks)

    if len(valid) < 4:
        missing = [names[i] for i, m in enumerate(marks) if m is None]
        return jsonify({
            'error': (
                f'Solo se detectaron {len(valid)}/4 marcas '
                f'(faltan: {", ".join(missing)}). '
                f'Asegúrate de encuadrar toda la hoja y buena iluminación.'
            )
        }), 422

    # Warp en gris → binarización adaptativa sobre papel plano (ver warp_perspective)
    warped_bin = warp_perspective(gray, marks)
    results    = process_omr(warped_bin, n)
    _save_debug(warped_bin, results, n)

    counts = {'ok': 0, 'blank': 0, 'double': 0}
    for r in results:
        counts[r.get('status', 'blank')] = counts.get(r.get('status', 'blank'), 0) + 1
    print(f"  ok:{counts['ok']}  blank:{counts['blank']}  double:{counts['double']}")
    for r in results:
        print(f"  Q{r['q']:2d}: {r['status']:8s} {r['detected'] or '—'}  px={r['counts']}")

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

    print(f"\n{'═'*52}")
    print(f"  Charly Táctico · Servidor OMR")
    print(f"{'═'*52}")
    print(f"  IP local  →  {local_ip}")
    print(f"  Celular   →  https://{local_ip}:5000/")
    print(f"{'═'*52}\n")

    app.run(host='0.0.0.0', port=5000, ssl_context='adhoc', debug=False)
