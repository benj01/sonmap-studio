-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Feature collections table
CREATE TABLE feature_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_file_id UUID NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups by project file
CREATE INDEX feature_collections_project_file_idx ON feature_collections(project_file_id);

-- Layers table
CREATE TABLE layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES feature_collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Geo features table with PostGIS geometry
CREATE TABLE geo_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id UUID NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  geometry GEOMETRY NOT NULL,
  properties JSONB DEFAULT '{}',
  srid INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_geometry CHECK (ST_IsValid(geometry))
);

-- Indexes for better query performance
CREATE INDEX geo_features_layer_id_idx ON geo_features(layer_id);
CREATE INDEX geo_features_geometry_idx ON geo_features USING GIST(geometry);
CREATE INDEX layers_collection_id_idx ON layers(collection_id);

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_feature_collections_updated_at
  BEFORE UPDATE ON feature_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_layers_updated_at
  BEFORE UPDATE ON layers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_geo_features_updated_at
  BEFORE UPDATE ON geo_features
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add RLS policies
ALTER TABLE feature_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_features ENABLE ROW LEVEL SECURITY;

-- RLS policies for feature_collections
CREATE POLICY "Users can view feature collections for their project files" ON feature_collections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_files pf
      WHERE pf.id = feature_collections.project_file_id
      AND pf.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert feature collections for their project files" ON feature_collections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_files pf
      WHERE pf.id = project_file_id
      AND pf.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can update feature collections for their project files" ON feature_collections
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_files pf
      WHERE pf.id = project_file_id
      AND pf.uploaded_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_files pf
      WHERE pf.id = project_file_id
      AND pf.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete feature collections for their project files" ON feature_collections
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_files pf
      WHERE pf.id = project_file_id
      AND pf.uploaded_by = auth.uid()
    )
  );

-- RLS policies for layers
CREATE POLICY "Users can view layers for their feature collections" ON layers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM feature_collections fc
      JOIN project_files pf ON pf.id = fc.project_file_id
      WHERE fc.id = layers.collection_id
      AND pf.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert layers for their feature collections" ON layers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM feature_collections fc
      JOIN project_files pf ON pf.id = fc.project_file_id
      WHERE fc.id = collection_id
      AND pf.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can update layers for their feature collections" ON layers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM feature_collections fc
      JOIN project_files pf ON pf.id = fc.project_file_id
      WHERE fc.id = collection_id
      AND pf.uploaded_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM feature_collections fc
      JOIN project_files pf ON pf.id = fc.project_file_id
      WHERE fc.id = collection_id
      AND pf.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete layers for their feature collections" ON layers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM feature_collections fc
      JOIN project_files pf ON pf.id = fc.project_file_id
      WHERE fc.id = collection_id
      AND pf.uploaded_by = auth.uid()
    )
  );

-- RLS policies for geo_features
CREATE POLICY "Users can view features for their layers" ON geo_features
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM layers l
      JOIN feature_collections fc ON fc.id = l.collection_id
      JOIN project_files pf ON pf.id = fc.project_file_id
      WHERE l.id = geo_features.layer_id
      AND pf.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert features for their layers" ON geo_features
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM layers l
      JOIN feature_collections fc ON fc.id = l.collection_id
      JOIN project_files pf ON pf.id = fc.project_file_id
      WHERE l.id = layer_id
      AND pf.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can update features for their layers" ON geo_features
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM layers l
      JOIN feature_collections fc ON fc.id = l.collection_id
      JOIN project_files pf ON pf.id = fc.project_file_id
      WHERE l.id = layer_id
      AND pf.uploaded_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM layers l
      JOIN feature_collections fc ON fc.id = l.collection_id
      JOIN project_files pf ON pf.id = fc.project_file_id
      WHERE l.id = layer_id
      AND pf.uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete features for their layers" ON geo_features
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM layers l
      JOIN feature_collections fc ON fc.id = l.collection_id
      JOIN project_files pf ON pf.id = fc.project_file_id
      WHERE l.id = layer_id
      AND pf.uploaded_by = auth.uid()
    )
  );
