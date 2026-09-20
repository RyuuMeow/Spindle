declare module "libavoid-js" {
  export const AvoidLib: {
    load(wasmUrl?: string): Promise<void>;
    getInstance(): unknown;
  };
}
declare module "*?url" {
  const url: string;
  export default url;
}
