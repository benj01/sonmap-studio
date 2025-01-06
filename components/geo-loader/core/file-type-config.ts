import { RelatedFile } from '../../files/types';

export interface FileTypeCompanion {
  extension: string;
  required: boolean;
  description: string;
}

export interface FileTypeConfig {
  mainExtension: string;
  description: string;
  companionFiles: FileTypeCompanion[];
  validateCompanions?: (files: { [key: string]: RelatedFile }) => { 
    valid: boolean;
    missingRequired: string[];
    message?: string;
  };
}

export const FILE_TYPE_CONFIGS: { [key: string]: FileTypeConfig } = {
  // Geo-spatial formats
  shapefile: {
    mainExtension: '.shp',
    description: 'ESRI Shapefile',
    companionFiles: [
      { 
        extension: '.shx', 
        required: true,
        description: 'Shape index file'
      },
      { 
        extension: '.dbf', 
        required: true,
        description: 'Attribute database file'
      },
      { 
        extension: '.prj', 
        required: false,
        description: 'Projection definition file'
      }
    ],
    validateCompanions: (files) => {
      const requiredExts = ['.shx', '.dbf'];
      const missingRequired = requiredExts.filter(ext => !files[ext]);
      
      return {
        valid: missingRequired.length === 0,
        missingRequired,
        message: missingRequired.length > 0 
          ? `Missing required companion files: ${missingRequired.join(', ')}. These files are required for proper shapefile functionality.`
          : undefined
      };
    }
  },
  dxf: {
    mainExtension: '.dxf',
    description: 'AutoCAD DXF',
    companionFiles: [
      {
        extension: '.ctb',
        required: false,
        description: 'Plot style table'
      },
      {
        extension: '.pc3',
        required: false,
        description: 'Plotter configuration file'
      }
    ]
  },
  dwg: {
    mainExtension: '.dwg',
    description: 'AutoCAD DWG',
    companionFiles: [
      {
        extension: '.ctb',
        required: false,
        description: 'Plot style table'
      },
      {
        extension: '.pc3',
        required: false,
        description: 'Plotter configuration file'
      }
    ]
  },

  // Text-based formats
  csv: {
    mainExtension: '.csv',
    description: 'Comma-Separated Values',
    companionFiles: []
  },
  txt: {
    mainExtension: '.txt',
    description: 'Text File',
    companionFiles: []
  },
  xyz: {
    mainExtension: '.xyz',
    description: 'XYZ Point Cloud',
    companionFiles: []
  },

  // Additional geo formats
  qmd: {
    mainExtension: '.qmd',
    description: 'QGIS Project Metadata',
    companionFiles: []
  },
  cpg: {
    mainExtension: '.cpg',
    description: 'Shapefile Codepage',
    companionFiles: []
  }
};

export function getFileTypeConfig(fileName: string): FileTypeConfig | undefined {
  const extension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  return Object.values(FILE_TYPE_CONFIGS).find(config => 
    config.mainExtension === extension
  );
}

export function validateCompanionFiles(
  mainFile: File,
  companionFiles: File[]
): { 
  valid: boolean;
  groupedFiles: { [key: string]: File };
  missingRequired: string[];
  message?: string;
} {
  const config = getFileTypeConfig(mainFile.name);
  if (!config) {
    return {
      valid: true,
      groupedFiles: {},
      missingRequired: []
    };
  }

  const groupedFiles: { [key: string]: File } = {};
  const baseName = mainFile.name.substring(0, mainFile.name.lastIndexOf('.'));

  // Group companion files by extension
  companionFiles.forEach(file => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const fileBaseName = file.name.substring(0, file.name.lastIndexOf('.'));
    
    // Only include files that match the base name and are valid companion extensions
    if (fileBaseName.toLowerCase() === baseName.toLowerCase() && 
        config.companionFiles.some(comp => comp.extension === ext)) {
      groupedFiles[ext] = file;
    }
  });

  // Check for missing required files
  const missingRequired = config.companionFiles
    .filter(comp => comp.required && !groupedFiles[comp.extension])
    .map(comp => comp.extension);

  // Use custom validation if available
  if (config.validateCompanions) {
    const relatedFiles: { [key: string]: RelatedFile } = {};
    Object.entries(groupedFiles).forEach(([ext, file]) => {
      relatedFiles[ext] = {
        path: URL.createObjectURL(file),
        size: file.size,
        name: file.name
      };
    });
    
    const validation = config.validateCompanions(relatedFiles);
    return {
      valid: validation.valid,
      groupedFiles,
      missingRequired: validation.missingRequired,
      message: validation.message
    };
  }

  return {
    valid: missingRequired.length === 0,
    groupedFiles,
    missingRequired,
    message: missingRequired.length > 0 
      ? `Missing required companion files: ${missingRequired.join(', ')}`
      : undefined
  };
}
