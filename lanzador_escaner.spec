# lanzador_escaner.spec
# PyInstaller spec para LanzadorEscaner.exe
# Build: pyinstaller lanzador_escaner.spec

block_cipher = None

a = Analysis(
    ['lanzador_escaner.py'],
    pathex=[],
    binaries=[],
    # Archivos estáticos que Flask sirve directamente
    datas=[
        ('escaner_cartilla.html', '.'),
        ('favicon.ico',           '.'),
        ('icons',                 'icons'),
        ('logo_charly.png',       '.'),
        ('theme.css',             '.'),
    ],
    hiddenimports=[
        # OpenCV
        'cv2',
        # Flask / Werkzeug
        'flask', 'flask_cors',
        'werkzeug', 'werkzeug.serving', 'werkzeug.security',
        'werkzeug.debug',
        # SSL adhoc (pyOpenSSL)
        'OpenSSL', 'OpenSSL.SSL', 'OpenSSL.crypto',
        'cryptography', 'cryptography.hazmat.primitives',
        # QR / Pillow
        'qrcode', 'qrcode.image.pil', 'qrcode.image.base',
        'PIL', 'PIL.Image', 'PIL.ImageTk',
        # imutils (usado en omr_server opcionalmente)
        'imutils',
        # Tkinter (por si el hook no lo detecta)
        'tkinter', 'tkinter.scrolledtext',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib', 'scipy', 'pandas', 'jupyter',
        'IPython', 'notebook', 'pytest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='LanzadorEscaner',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,          # Sin ventana de consola
    uac_admin=True,         # Solicita UAC automáticamente al abrir
    icon='favicon.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='LanzadorEscaner',
)
