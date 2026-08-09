/**
 * Declaracion minima de tipos para Marzipano 0.10 (sin tipos oficiales).
 * Solo se tipa lo que usamos; el resto queda como any.
 */
declare module "marzipano" {
  const Marzipano: {
    Viewer: any;
    Scene: any;
    CubeGeometry: any;
    EquirectGeometry: any;
    FlatGeometry: any;
    RectilinearView: any;
    FlatView: any;
    ImageUrlSource: any;
    SingleAssetSource: any;
    StaticAsset: any;
    DynamicAsset: any;
    TextureStore: any;
    Layer: any;
    RenderLoop: any;
    Controls: any;
    Dynamics: any;
    Hotspot: any;
    HotspotContainer: any;
    WebGlStage: any;
    autorotate: (opts?: {
      yawSpeed?: number;
      pitchSpeed?: number;
      fovSpeed?: number;
      targetPitch?: number | null;
      targetFov?: number | null;
    }) => () => (params: any, dt: number) => any;
    registerDefaultControls: any;
    colorEffects: any;
    util: {
      compose: (...fns: any[]) => any;
      tween: (duration: number, update: (t: number) => void, done: () => void) => () => void;
      clamp: (x: number, min: number, max: number) => number;
      mod: (a: number, b: number) => number;
      degToRad: (deg: number) => number;
      radToDeg: (rad: number) => number;
      [k: string]: any;
    };
    dependencies: any;
  };
  export = Marzipano;
}
