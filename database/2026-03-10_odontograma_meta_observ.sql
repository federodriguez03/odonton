-- Add observaciones column to odontograma_meta
ALTER TABLE odontograma_meta ADD COLUMN IF NOT EXISTS observaciones TEXT;
