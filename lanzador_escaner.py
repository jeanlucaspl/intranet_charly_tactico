#!/usr/bin/env python3
"""
lanzador_escaner.py — Lanzador GUI para el Servidor OMR Charly Táctico
Corre Flask en un hilo interno (compatible con PyInstaller onedir).
Doble clic en LANZAR_ESCANER.bat (Python) o en LanzadorEscaner.exe (build).
"""

import os
import sys
import socket
import subprocess
import threading
import logging
import queue
import tkinter as tk
from tkinter import scrolledtext

PUERTO       = 5000
COLOR_BG     = "#080C10"
COLOR_DARK   = "#13191f"
COLOR_GOLD   = "#C9A84C"
COLOR_TEXT   = "#F0F4F8"
COLOR_GREEN  = "#28a745"
COLOR_RED    = "#E05555"
COLOR_YELLOW = "#f0c040"
WIN_NO_WIN   = 0x08000000  # CREATE_NO_WINDOW (solo Windows)


# ── Utilidades ──────────────────────────────────────────────────────

def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def _no_window() -> dict:
    return {"creationflags": WIN_NO_WIN} if sys.platform == "win32" else {}


def add_firewall_rule(port: int) -> bool:
    name = "CharlyTactico-OMR"
    subprocess.run(
        ["netsh", "advfirewall", "firewall", "delete", "rule", f"name={name}"],
        capture_output=True, **_no_window()
    )
    r = subprocess.run([
        "netsh", "advfirewall", "firewall", "add", "rule",
        f"name={name}", "dir=in", "action=allow",
        "protocol=TCP", f"localport={port}",
    ], capture_output=True, text=True, **_no_window())
    return r.returncode == 0


def remove_firewall_rule():
    subprocess.run(
        ["netsh", "advfirewall", "firewall", "delete", "rule",
         "name=CharlyTactico-OMR"],
        capture_output=True, **_no_window()
    )


def install_deps(log):
    """Solo se usa cuando se corre con Python (no desde el .exe)."""
    req = os.path.join(os.path.dirname(os.path.abspath(__file__)), "requirements.txt")
    log("Verificando dependencias del servidor…")
    r = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", req, "--quiet"],
        capture_output=True, text=True, **_no_window()
    )
    if r.returncode != 0:
        log(f"  ⚠  {r.stderr.strip()[:200]}")
    for pkg in ("qrcode", "pillow"):
        subprocess.run(
            [sys.executable, "-m", "pip", "install", pkg, "--quiet"],
            capture_output=True, **_no_window()
        )
    log("✓ Dependencias listas.")


# ── Handler de logging → Queue (para mostrar logs del servidor en GUI) ──

class _QueueHandler(logging.Handler):
    def __init__(self, q: queue.Queue):
        super().__init__()
        self.q = q

    def emit(self, record):
        try:
            self.q.put_nowait(self.format(record))
        except Exception:
            pass


# ── Aplicación GUI ──────────────────────────────────────────────────

class LanzadorApp:
    def __init__(self, root: tk.Tk):
        self.root    = root
        self.running = False
        self.log_q   = queue.Queue()
        self._qr_img = None  # referencia para tkinter

        self._build_ui()
        threading.Thread(target=self._setup, daemon=True).start()

    # ── Interfaz ────────────────────────────────────────────────────

    def _build_ui(self):
        r = self.root
        r.title("Charly Táctico · Escáner OMR")
        r.configure(bg=COLOR_BG)
        r.geometry("560x680")
        r.resizable(False, False)

        bar = tk.Frame(r, bg=COLOR_GOLD, height=56)
        bar.pack(fill=tk.X)
        bar.pack_propagate(False)
        tk.Label(bar, text="CHARLY TÁCTICO  ·  ESCÁNER OMR",
                 bg=COLOR_GOLD, fg=COLOR_BG,
                 font=("Arial", 13, "bold")).pack(expand=True)

        self.lbl_status = tk.Label(r, text="Iniciando…",
                                    bg=COLOR_BG, fg=COLOR_GOLD,
                                    font=("Arial", 12, "bold"))
        self.lbl_status.pack(pady=(14, 4))

        panel = tk.Frame(r, bg=COLOR_DARK)
        panel.pack(padx=24, pady=4, fill=tk.X)

        tk.Label(panel, text="Abre este enlace desde el celular:",
                 bg=COLOR_DARK, fg=COLOR_TEXT,
                 font=("Arial", 10)).pack(pady=(12, 4))

        self.lbl_qr = tk.Label(panel, bg=COLOR_DARK)
        self.lbl_qr.pack()

        self.lbl_url = tk.Label(panel, text="—",
                                 bg=COLOR_DARK, fg=COLOR_GOLD,
                                 font=("Courier", 13, "bold"))
        self.lbl_url.pack(pady=(4, 12))

        tk.Label(r,
                 text="⚠  El celular mostrará un aviso de seguridad.\n"
                      "Pulsa  «Avanzado»  →  «Continuar al sitio»  para acceder.",
                 bg=COLOR_BG, fg=COLOR_YELLOW,
                 font=("Arial", 9), justify=tk.CENTER).pack(pady=6, padx=24)

        lf = tk.Frame(r, bg=COLOR_BG)
        lf.pack(fill=tk.BOTH, expand=True, padx=24, pady=(4, 0))
        tk.Label(lf, text="Registro:", bg=COLOR_BG, fg=COLOR_TEXT,
                 font=("Arial", 9)).pack(anchor=tk.W)
        self.txt = scrolledtext.ScrolledText(
            lf, height=9, bg=COLOR_DARK, fg=COLOR_TEXT,
            font=("Courier", 8), state=tk.DISABLED, relief=tk.FLAT,
        )
        self.txt.pack(fill=tk.BOTH, expand=True)

        btn_frame = tk.Frame(r, bg=COLOR_BG)
        btn_frame.pack(pady=14)

        self.btn_stop = tk.Button(
            btn_frame, text="Detener servidor",
            bg=COLOR_RED, fg="white", activebackground="#b03030",
            font=("Arial", 11, "bold"), padx=22, pady=8,
            relief=tk.FLAT, cursor="hand2",
            command=self.stop_server, state=tk.DISABLED,
        )
        self.btn_stop.pack(side=tk.LEFT, padx=(0, 8))

        tk.Button(
            btn_frame, text="Ver fotos del proceso",
            bg=COLOR_DARK, fg=COLOR_GOLD, activebackground="#1e2830",
            font=("Arial", 10), padx=14, pady=8,
            relief=tk.FLAT, cursor="hand2",
            command=self._abrir_carpeta_debug,
        ).pack(side=tk.LEFT)

    # ── Helpers thread-safe ─────────────────────────────────────────

    def _log(self, msg: str):
        def _():
            self.txt.configure(state=tk.NORMAL)
            self.txt.insert(tk.END, msg + "\n")
            self.txt.see(tk.END)
            self.txt.configure(state=tk.DISABLED)
        self.root.after(0, _)

    def _status(self, msg: str, color=COLOR_GOLD):
        self.root.after(0, lambda: self.lbl_status.configure(text=msg, fg=color))

    def _poll_logs(self):
        """Drena la queue de logs cada 300 ms."""
        while not self.log_q.empty():
            try:
                self._log(self.log_q.get_nowait())
            except queue.Empty:
                break
        if self.running:
            self.root.after(300, self._poll_logs)

    # ── Arranque ────────────────────────────────────────────────────

    def _setup(self):
        # Instalar deps solo si corremos como script Python (no .exe)
        if not getattr(sys, 'frozen', False):
            self._status("Instalando dependencias…")
            install_deps(self._log)

        self._status("Configurando firewall…")
        self._log(f"Abriendo puerto {PUERTO} en el Firewall de Windows…")
        ok = add_firewall_rule(PUERTO)
        self._log(f"{'✓ Puerto ' + str(PUERTO) + ' habilitado.' if ok else '⚠  Firewall: puede que ya esté abierto.'}")

        self._status("Iniciando servidor OMR…")
        self._launch_flask()

    def _launch_flask(self):
        # Redirigir logs de werkzeug/Flask a la queue
        fmt = logging.Formatter("%(message)s")
        handler = _QueueHandler(self.log_q)
        handler.setFormatter(fmt)
        for name in ("werkzeug", "flask.app"):
            lg = logging.getLogger(name)
            lg.addHandler(handler)
            lg.setLevel(logging.INFO)

        # Importar la app Flask de omr_server
        try:
            from omr_server import app as flask_app
        except Exception as e:
            self._log(f"ERROR importando omr_server: {e}")
            self._status("Error al cargar el servidor", COLOR_RED)
            return

        self.running = True

        def _run():
            try:
                flask_app.run(
                    host="0.0.0.0", port=PUERTO,
                    ssl_context="adhoc",
                    debug=False, use_reloader=False,
                )
            except Exception as e:
                self.log_q.put(f"ERROR servidor: {e}")

        threading.Thread(target=_run, daemon=True).start()

        ip  = get_local_ip()
        url = f"https://{ip}:{PUERTO}"
        self.root.after(0, lambda: self._show_qr(url))
        self._status(f"Servidor activo  ·  {ip}:{PUERTO}", COLOR_GREEN)
        self.root.after(0, lambda: self.btn_stop.configure(state=tk.NORMAL))
        self.root.after(300, self._poll_logs)

    def _show_qr(self, url: str):
        self.lbl_url.configure(text=url)
        try:
            import qrcode
            from PIL import ImageTk
            qr = qrcode.QRCode(box_size=6, border=2)
            qr.add_data(url)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            self._qr_img = ImageTk.PhotoImage(img)
            self.lbl_qr.configure(image=self._qr_img)
        except Exception as e:
            self._log(f"(QR no disponible: {e})")

    # ── Control ─────────────────────────────────────────────────────

    def _abrir_carpeta_debug(self):
        import tempfile
        carpeta = tempfile.gettempdir()
        try:
            if sys.platform == "win32":
                os.startfile(carpeta)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", carpeta])
            else:
                subprocess.Popen(["xdg-open", carpeta])
        except Exception as e:
            self._log(f"No se pudo abrir la carpeta: {e}")

    def stop_server(self):
        self.running = False
        remove_firewall_rule()
        self._status("Servidor detenido", COLOR_RED)
        self.root.after(0, lambda: self.btn_stop.configure(state=tk.DISABLED))
        self._log("Servidor detenido. Regla de firewall eliminada.")

    def on_close(self):
        self.stop_server()
        self.root.destroy()


# ── Entry point ─────────────────────────────────────────────────────

if __name__ == "__main__":
    root = tk.Tk()
    app  = LanzadorApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()
