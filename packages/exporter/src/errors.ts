/** Lectura fallida de un asset, con el estado HTTP si lo hubo (null: red). */
export class AssetReadError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "AssetReadError";
    this.status = status;
  }
}
