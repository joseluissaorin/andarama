import { describe, expect, it } from "vitest";
import { viewsOfPresent, type PresenceUser, type RemoteView } from "./store";

const user = (connectionId: string): PresenceUser => ({
  connectionId,
  userId: `u-${connectionId}`,
  name: connectionId,
  color: "#000",
  sceneId: null,
  tab: null,
  focus: null,
});
const view: RemoteView = { sceneId: "s1", yaw: 0, pitch: 0, pointer: null };

describe("viewsOfPresent", () => {
  it("olvida la mirada de quien ya no está en la sala", () => {
    // c1 se fue y volvió como c3: su mirada vieja no puede quedarse sin nombre
    const views = { c1: view, c2: view, c3: view };
    expect(Object.keys(viewsOfPresent(views, [user("c2"), user("c3")]))).toEqual(["c2", "c3"]);
  });
  it("sin nadie en la sala no queda ninguna mirada", () => {
    expect(viewsOfPresent({ c1: view }, [])).toEqual({});
  });
});
