import React, { useEffect, useState } from 'react';
import { useWizard } from '../WizardContext';
import { ParserFactory } from '@/core/processors/parser-factory';
import { createClient } from '@/utils/supabase/client';

interface ParseStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ParseStep({ onNext, onBack }: ParseStepProps) {
  const { fileInfo, setDataset } = useWizard();
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const parseFile = async () => {
      if (!fileInfo?.id || !fileInfo.name) return;
      setParsing(true);
      setError(null);
      try {
        // 1. Query DB for main file record to get storage_path
        const { data: mainFileRecord, error: mainFileError } = await supabase
          .from('project_files')
          .select('storage_path')
          .eq('id', fileInfo.id)
          .single();
        if (mainFileError || !mainFileRecord) {
          setError(mainFileError?.message || 'Main file record not found');
          setParsing(false);
          return;
        }
        // 2. Download main file using storage_path
        const { data, error: downloadError } = await supabase.storage
          .from('project-files')
          .download(mainFileRecord.storage_path);
        if (downloadError || !data) {
          setError(downloadError?.message || 'Failed to download file');
          setParsing(false);
          return;
        }
        const arrayBuffer = await data.arrayBuffer();
        // 3. Download companion files using their storage_path
        let companionBuffers: Record<string, ArrayBuffer> = {};
        if (fileInfo.companions && fileInfo.companions.length > 0) {
          for (const companion of fileInfo.companions) {
            const { data: compRecord, error: compDbError } = await supabase
              .from('project_files')
              .select('storage_path')
              .eq('id', companion.id)
              .single();
            if (compDbError || !compRecord) continue;
            const { data: compData, error: compError } = await supabase.storage
              .from('project-files')
              .download(compRecord.storage_path);
            if (!compError && compData) {
              const ext = companion.name.match(/\.[^.]+$/)?.[0].toLowerCase() || '';
              companionBuffers[ext] = await compData.arrayBuffer();
            }
          }
        }
        // Use parser factory to parse the file
        const parser = ParserFactory.createParser(fileInfo.name);
        const fullDataset = await parser.parse(arrayBuffer, companionBuffers, { maxFeatures: 10000 });
        setDataset(fullDataset);
        setParsing(false);
      } catch (err: any) {
        setError(err.message || 'Parsing failed');
        setParsing(false);
      }
    };
    if (fileInfo?.id && fileInfo.name) {
      parseFile();
    }
  }, [fileInfo, setDataset, onNext, supabase]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 2: Parsing & Initial Analysis</h2>
      {!fileInfo?.name && <div className="text-red-600">No file selected.</div>}
      {parsing && <div className="text-blue-600">Parsing file...</div>}
      {error && <div className="text-red-600">{error}</div>}
      <div className="flex gap-2 mt-4">
        <button
          className="px-4 py-2 bg-gray-300 text-gray-800 rounded"
          onClick={onBack}
          disabled={parsing}
        >
          Back
        </button>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          onClick={onNext}
          disabled={parsing || !!error || !fileInfo?.name}
        >
          Next
        </button>
      </div>
    </div>
  );
} 