const fs = require('fs');
const path = require('path');
const kinks = require('@turf/kinks').default;
const cleanCoords = require('@turf/clean-coords').default;

// Function to read and parse the CSV file
function readCSVGeometry(filePath) {
    console.log('Reading file:', filePath);
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const lines = csvContent.split('\n')
        .filter(line => line.trim())
        .slice(1); // Skip header row
    
    console.log(`Found ${lines.length} coordinate pairs`);
    
    // Parse coordinates from CSV
    const coordinates = lines.map(line => {
        const [buildingId, x, y] = line.split(',').map(Number);
        return [x, y]; // Only use X and Y coordinates
    });

    // Ensure the polygon is closed
    if (coordinates.length > 0 && 
        (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || 
         coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
        coordinates.push([...coordinates[0]]);
    }

    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [coordinates]
        },
        properties: {}
    };
}

function validateAndRepairGeometry(geometry) {
    try {
        // Only process polygon geometries
        if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
            return { geometry, wasRepaired: false, wasCleaned: false };
        }

        const feature = {
            type: 'Feature',
            geometry,
            properties: {}
        };

        // First clean duplicate vertices with a small tolerance
        let cleaned = feature;
        let wasCleaned = false;

        try {
            // Function to clean near-duplicate points within a tolerance
            const cleanWithTolerance = (coords) => {
                // Use 5cm tolerance for Swiss LV95 coordinates
                const tolerance = 0.05; // 5cm in meters
                const result = [];
                let lastPoint = null;

                console.log(`\nCleaning ring with ${coords.length} points...`);

                for (const point of coords) {
                    if (!lastPoint) {
                        result.push(point);
                        lastPoint = point;
                        continue;
                    }

                    // Check if point is too close to last point
                    const dx = point[0] - lastPoint[0];
                    const dy = point[1] - lastPoint[1];
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance > tolerance) {
                        result.push(point);
                        lastPoint = point;
                    } else {
                        console.log('Removed near-duplicate point', {
                            distance,
                            tolerance,
                            point,
                            lastPoint
                        });
                    }
                }

                // Ensure the ring is closed
                if (result.length > 0) {
                    result.push([...result[0]]);
                }

                console.log(`Ring cleaned: ${coords.length} points -> ${result.length} points`);
                return result;
            };

            // Clean each ring of the polygon
            if (geometry.type === 'Polygon') {
                const cleanedCoords = geometry.coordinates.map(ring => cleanWithTolerance(ring));
                cleaned = {
                    ...feature,
                    geometry: {
                        type: 'Polygon',
                        coordinates: cleanedCoords
                    }
                };
            } else {
                const cleanedCoords = geometry.coordinates.map(poly => 
                    poly.map(ring => cleanWithTolerance(ring))
                );
                cleaned = {
                    ...feature,
                    geometry: {
                        type: 'MultiPolygon',
                        coordinates: cleanedCoords
                    }
                };
            }

            // Then apply standard clean-coords to catch any remaining issues
            cleaned = cleanCoords(cleaned);
            
            // Check if cleaning made any changes
            wasCleaned = JSON.stringify(cleaned.geometry) !== JSON.stringify(feature.geometry);
            
            if (wasCleaned) {
                console.log('Cleaned duplicate/near-duplicate vertices from geometry');
            }
        } catch (error) {
            console.warn('Failed to clean vertices', error);
            // Continue with original geometry if cleaning fails
            cleaned = feature;
        }

        // Check for self-intersections
        const intersections = kinks(cleaned);
        
        if (intersections.features.length > 0) {
            console.log('Found self-intersections in geometry', {
                intersectionCount: intersections.features.length
            });

            // For now, just return the cleaned geometry
            // This will help us understand if the cleaning alone is sufficient
            return {
                geometry: cleaned.geometry,
                wasRepaired: false,
                wasCleaned,
                warning: `${intersections.features.length} self-intersections remain`
            };
        }

        return { 
            geometry: cleaned.geometry, 
            wasRepaired: false,
            wasCleaned
        };

    } catch (error) {
        console.warn('Failed to validate/repair geometry', {
            error,
            geometryType: geometry.type,
            ringCount: geometry.type === 'Polygon' ? geometry.coordinates.length : undefined
        });
        return { 
            geometry: null, 
            wasRepaired: false,
            wasCleaned: false
        };
    }
}

async function debugGeometry() {
    console.time('Total processing time');
    
    try {
        // Read the geometry from CSV
        const csvPath = path.join(__dirname, '../test-data/638.csv');
        console.log('\nReading geometry from CSV...');
        const geometry = readCSVGeometry(csvPath);
        
        console.log('\nOriginal geometry stats:');
        console.log(`- Number of points: ${geometry.geometry.coordinates[0].length}`);
        
        // Add timing for kinks detection
        console.log('\nChecking for self-intersections...');
        console.time('Kinks detection time');
        const intersections = kinks(geometry);
        console.timeEnd('Kinks detection time');
        console.log(`- Found ${intersections.features.length} self-intersections`);
        
        if (intersections.features.length > 0) {
            console.log('Self-intersection points:');
            intersections.features.forEach((f, i) => {
                console.log(`  ${i + 1}. [${f.geometry.coordinates.join(', ')}]`);
            });
        }
        
        // Try to validate and repair with timing
        console.log('\nAttempting to validate and repair geometry...');
        console.time('Validation and repair time');
        
        const result = validateAndRepairGeometry(geometry.geometry);
        
        console.timeEnd('Validation and repair time');
        
        if (result.error) {
            console.error('Error during validation:', result.error);
        } else {
            console.log('\nProcessing results:');
            console.log(`- Was repaired: ${result.wasRepaired}`);
            console.log(`- Was cleaned: ${result.wasCleaned}`);
            if (result.warning) {
                console.log(`- Warning: ${result.warning}`);
            }
            
            if (result.geometry && result.geometry.type === 'Polygon') {
                console.log(`- Resulting point count: ${result.geometry.coordinates[0].length}`);
                
                // Save the result to a GeoJSON file for inspection
                const resultGeoJSON = {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: result.geometry,
                        properties: {}
                    }]
                };
                fs.writeFileSync(
                    path.join(__dirname, '../test-data/638_cleaned.geojson'),
                    JSON.stringify(resultGeoJSON, null, 2)
                );
                console.log('\nSaved cleaned geometry to 638_cleaned.geojson');
            }
        }
        
    } catch (error) {
        console.error('Fatal error during processing:', error);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
    
    console.timeEnd('Total processing time');
}

// Run the debug process
debugGeometry().catch(console.error); 