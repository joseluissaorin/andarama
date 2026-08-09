/**
 * Export SCORM 1.2 y 2004 (3rd Ed.): manifiesto IMS + adaptador JS que
 * localiza la API del LMS y reporta finalizacion y puntuacion del quiz.
 */

export type ScormVersion = "1.2" | "2004";

function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function renderImsManifest(opts: {
  version: ScormVersion;
  identifier: string;
  title: string;
  files: string[];
}): string {
  const { version, identifier, title, files } = opts;
  const fileTags = files.map((f) => `      <file href="${esc(f)}"/>`).join("\n");
  if (version === "1.2") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${esc(identifier)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG">
    <organization identifier="ORG">
      <title>${esc(title)}</title>
      <item identifier="ITEM" identifierref="RES">
        <title>${esc(title)}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileTags}
    </resource>
  </resources>
</manifest>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${esc(identifier)}" version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations default="ORG">
    <organization identifier="ORG">
      <title>${esc(title)}</title>
      <item identifier="ITEM" identifierref="RES">
        <title>${esc(title)}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES" type="webcontent" adlcp:scormType="sco" href="index.html">
${fileTags}
    </resource>
  </resources>
</manifest>`;
}

export function renderScormAdapter(version: ScormVersion, passingScore: number | null): string {
  return `// Adaptador SCORM ${version} de ULL360: reporta finalizacion y puntuacion.
(function () {
  "use strict";
  var IS_2004 = ${version === "2004" ? "true" : "false"};
  var PASSING = ${passingScore ?? "null"};
  var api = null;
  var initialized = false;

  function findApi(win) {
    var attempts = 0;
    while (win != null && attempts < 10) {
      var candidate = IS_2004 ? win.API_1484_11 : win.API;
      if (candidate != null) return candidate;
      if (win.parent == null || win.parent === win) break;
      win = win.parent;
      attempts++;
    }
    try {
      if (window.opener != null) {
        return IS_2004 ? window.opener.API_1484_11 : window.opener.API;
      }
    } catch (e) { /* cross-origin */ }
    return null;
  }

  function init() {
    api = findApi(window);
    if (api == null) return;
    if (IS_2004) { api.Initialize(""); } else { api.LMSInitialize(""); }
    initialized = true;
    set(IS_2004 ? "cmi.completion_status" : "cmi.core.lesson_status", "incomplete");
    commit();
  }

  function set(key, value) {
    if (!initialized) return;
    if (IS_2004) { api.SetValue(key, String(value)); } else { api.LMSSetValue(key, String(value)); }
  }
  function commit() {
    if (!initialized) return;
    if (IS_2004) { api.Commit(""); } else { api.LMSCommit(""); }
  }
  function finish() {
    if (!initialized) return;
    if (IS_2004) { api.Terminate(""); } else { api.LMSFinish(""); }
    initialized = false;
  }

  var lastReported = "";
  window.addEventListener("ull360:state", function (e) {
    if (!initialized) return;
    var s = e.detail;
    var completed = s.scenesVisited >= s.scenesTotal || (s.quiz.total > 0 && s.quiz.answered === s.quiz.total);
    if (s.quiz.total > 0 && s.quiz.maxScore > 0) {
      var pct = Math.round((s.quiz.score / s.quiz.maxScore) * 100);
      if (IS_2004) {
        set("cmi.score.raw", s.quiz.score);
        set("cmi.score.min", 0);
        set("cmi.score.max", s.quiz.maxScore);
        set("cmi.score.scaled", (s.quiz.score / s.quiz.maxScore).toFixed(4));
      } else {
        set("cmi.core.score.raw", s.quiz.score);
        set("cmi.core.score.min", 0);
        set("cmi.core.score.max", s.quiz.maxScore);
      }
      if (completed && s.quiz.answered === s.quiz.total) {
        var passed = PASSING == null ? true : pct >= PASSING;
        if (IS_2004) {
          set("cmi.success_status", passed ? "passed" : "failed");
        } else {
          set("cmi.core.lesson_status", passed ? "passed" : "failed");
        }
      }
    }
    var status = completed ? "completed" : "incomplete";
    if (IS_2004) { set("cmi.completion_status", status); }
    else if (s.quiz.total === 0) { set("cmi.core.lesson_status", status); }
    var snapshot = JSON.stringify([completed, s.quiz.score]);
    if (snapshot !== lastReported) {
      lastReported = snapshot;
      commit();
    }
  });

  window.addEventListener("pagehide", function () { commit(); finish(); });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
`;
}
