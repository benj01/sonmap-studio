-- SIA 2014 Schema Migration

-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add SIA layer information to existing layers table
ALTER TABLE dxf_layers 
  ADD COLUMN IF NOT EXISTS sia_agent varchar(50),
  ADD COLUMN IF NOT EXISTS sia_element varchar(50),
  ADD COLUMN IF NOT EXISTS sia_presentation varchar(50),
  ADD COLUMN IF NOT EXISTS sia_scale varchar(50),
  ADD COLUMN IF NOT EXISTS sia_phase varchar(50),
  ADD COLUMN IF NOT EXISTS sia_status varchar(50),
  ADD COLUMN IF NOT EXISTS sia_location varchar(50),
  ADD COLUMN IF NOT EXISTS sia_projection varchar(50),
  ADD COLUMN IF NOT EXISTS sia_free_typing jsonb,
  ADD COLUMN IF NOT EXISTS sia_metadata jsonb;

-- Create index for SIA fields to improve query performance
CREATE INDEX IF NOT EXISTS idx_dxf_layers_sia_agent ON dxf_layers(sia_agent);
CREATE INDEX IF NOT EXISTS idx_dxf_layers_sia_element ON dxf_layers(sia_element);
CREATE INDEX IF NOT EXISTS idx_dxf_layers_sia_presentation ON dxf_layers(sia_presentation);
CREATE INDEX IF NOT EXISTS idx_dxf_layers_sia_status ON dxf_layers(sia_status);

-- Create GiST index for jsonb fields
CREATE INDEX IF NOT EXISTS idx_dxf_layers_sia_metadata ON dxf_layers USING gin (sia_metadata);
CREATE INDEX IF NOT EXISTS idx_dxf_layers_sia_free_typing ON dxf_layers USING gin (sia_free_typing);

-- Create table for SIA headers
CREATE TABLE IF NOT EXISTS dxf_sia_headers (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES dxf_files(id) ON DELETE CASCADE,
  obj_file varchar(255) NOT NULL,
  proj_file varchar(255) NOT NULL,
  file_name varchar(255) NOT NULL,
  text_file text,
  date_file varchar(8) NOT NULL,
  ver_file varchar(50) NOT NULL,
  agent_file varchar(255) NOT NULL,
  ver_sia2014 varchar(50) NOT NULL,
  custom_keys jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for file_id to improve joins
CREATE INDEX IF NOT EXISTS idx_dxf_sia_headers_file_id ON dxf_sia_headers(file_id);

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updating timestamp
CREATE TRIGGER update_dxf_sia_headers_updated_at
  BEFORE UPDATE ON dxf_sia_headers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create view for SIA layer information
CREATE OR REPLACE VIEW dxf_sia_layers_view AS
SELECT 
  l.*,
  h.obj_file,
  h.proj_file,
  h.ver_sia2014,
  h.custom_keys
FROM dxf_layers l
LEFT JOIN dxf_files f ON l.file_id = f.id
LEFT JOIN dxf_sia_headers h ON f.id = h.file_id;

-- Create function to search layers by SIA fields
CREATE OR REPLACE FUNCTION search_sia_layers(
  p_agent varchar = NULL,
  p_element varchar = NULL,
  p_presentation varchar = NULL,
  p_scale varchar = NULL,
  p_phase varchar = NULL,
  p_status varchar = NULL,
  p_location varchar = NULL,
  p_projection varchar = NULL
) RETURNS TABLE (
  id integer,
  name varchar,
  sia_agent varchar,
  sia_element varchar,
  sia_presentation varchar,
  sia_scale varchar,
  sia_phase varchar,
  sia_status varchar,
  sia_location varchar,
  sia_projection varchar,
  sia_metadata jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.name,
    l.sia_agent,
    l.sia_element,
    l.sia_presentation,
    l.sia_scale,
    l.sia_phase,
    l.sia_status,
    l.sia_location,
    l.sia_projection,
    l.sia_metadata
  FROM dxf_layers l
  WHERE 
    (p_agent IS NULL OR l.sia_agent = p_agent) AND
    (p_element IS NULL OR l.sia_element = p_element) AND
    (p_presentation IS NULL OR l.sia_presentation = p_presentation) AND
    (p_scale IS NULL OR l.sia_scale = p_scale) AND
    (p_phase IS NULL OR l.sia_phase = p_phase) AND
    (p_status IS NULL OR l.sia_status = p_status) AND
    (p_location IS NULL OR l.sia_location = p_location) AND
    (p_projection IS NULL OR l.sia_projection = p_projection);
END;
$$ LANGUAGE plpgsql; 