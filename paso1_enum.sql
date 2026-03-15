-- ══════════════════════════════════════════════════
-- PROFESORES Y FACIAL DESCRIPTOR
-- ══════════════════════════════════════════════════

-- 1. Agregar rol profesor al enum
alter type rol_usuario add value if not exists 'profesor';

-- Ejecutar en consulta SEPARADA después:
-- (el enum necesita committearse primero)
