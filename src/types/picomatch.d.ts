declare module "picomatch" {
  export type PicomatchOptions = {
    dot?: boolean;
    posixSlashes?: boolean;
  };

  const picomatch: {
    isMatch(
      input: string,
      glob: string | readonly string[],
      options?: PicomatchOptions
    ): boolean;
  };

  export default picomatch;
}
