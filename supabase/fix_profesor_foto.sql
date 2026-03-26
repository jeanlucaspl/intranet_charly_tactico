-- 1. Ver foto_url del profesor
SELECT p.id, p.foto_url, p.foto_descriptor IS NOT NULL as tiene_descriptor, pf.nombre, pf.apellido
FROM profesores p
JOIN perfiles pf ON pf.id = p.perfil_id
WHERE p.id = '66a28334-f322-4e20-ad0c-ec87fbde5113';

-- 2. Ver todos los registros de materia_profesor con su profesor
SELECT mp.id, mp.profesor_id, mp.materia_id, m.nombre as materia,
       pf.nombre, pf.apellido
FROM materia_profesor mp
JOIN materias m ON m.id = mp.materia_id
LEFT JOIN profesores pr ON pr.id = mp.profesor_id
LEFT JOIN perfiles pf ON pf.id = pr.perfil_id
ORDER BY pf.apellido;

-- 3. Limpiar registros huérfanos (profesor eliminado)
DELETE FROM materia_profesor
WHERE profesor_id NOT IN (SELECT id FROM profesores);

-- 4. Si foto_url tiene algo incorrecto, limpiarlo
-- (ejecutar solo si la consulta 1 muestra un valor incorrecto)
-- UPDATE profesores SET foto_url = NULL, foto_descriptor = NULL
-- WHERE id = '66a28334-f322-4e20-ad0c-ec87fbde5113';
