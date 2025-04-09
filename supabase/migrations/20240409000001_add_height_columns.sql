-- Add height columns to geo_features table
ALTER TABLE geo_features
ADD COLUMN lhn95_height float,
ADD COLUMN ellipsoidal_height float;

-- Create index on lhn95_height for faster queries
CREATE INDEX idx_geo_features_lhn95_height ON geo_features(lhn95_height);

-- Add comment explaining the columns
COMMENT ON COLUMN geo_features.lhn95_height IS 'Height in LHN95 system (Swiss height system)';
COMMENT ON COLUMN geo_features.ellipsoidal_height IS 'Height in ellipsoidal system (WGS84)'; 