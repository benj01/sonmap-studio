declare module 'array-source' {
  interface ArraySource {
    pipe: <T>(destination: T) => T;
    destroy: () => void;
    readable: boolean;
  }
  
  function array(data: ArrayBuffer | Uint8Array): ArraySource;
  export default array;
} 