declare module "adm-zip" {
  export default class AdmZip {
    constructor(input?: Buffer | string);
    getEntries(): Array<{
      entryName: string;
      isDirectory: boolean;
      getData(): Buffer;
    }>;
  }
}
