-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Feature collections table
CREATE TABLE feature_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
