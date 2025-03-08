-- Function to check details of another function
CREATE OR REPLACE FUNCTION check_function_details(function_name TEXT)
RETURNS TABLE (
  schema_name TEXT,
  function_name TEXT,
  argument_types TEXT,
  return_type TEXT,
  security_type TEXT,
  is_strict BOOLEAN,
  description TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS argument_types,
    pg_get_function_result(p.oid) AS return_type,
    CASE 
      WHEN p.prosecdef THEN 'SECURITY DEFINER'
      ELSE 'SECURITY INVOKER'
    END AS security_type,
    p.proisstrict AS is_strict,
    d.description
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  LEFT JOIN pg_description d ON p.oid = d.objoid
  WHERE p.proname = function_name;
$$; 