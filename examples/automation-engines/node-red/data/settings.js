// EXAMPLE ONLY - NOT PART OF THE WHOOBE DISTRIBUTION. Node-RED settings shared by the development and the production compose files.
// NODE_RED_EDITOR=1 (development only) turns the editor and its admin API on. Without it httpAdminRoot is false: there is no editor, no /flows API, no
// way to change a flow from the network; the flows are whatever file is mounted at /data/flows.json.
module.exports = {
  flowFile: 'flows.json',
  // one node per line with a stable layout, so a change to a flow is a readable diff in git
  flowFilePretty: true,
  uiPort: process.env.PORT || 1880,
  httpAdminRoot: process.env.NODE_RED_EDITOR === '1' ? '/' : false,
  // the entry of the flow (POST /whoobe-events) lives under httpNodeRoot; no static files are served
  httpNodeRoot: '/',
  httpStatic: false,
  // credentials are not kept in the flow file: the flow reads WHOOBE_KEY, WHOOBE_CLIENT_URL and WHOOBE_SIGNING_SECRET from the environment
  functionExternalModules: true,
  functionGlobalContext: {},
  exportGlobalContextKeys: false,
  editorTheme: { projects: { enabled: false } },
  logging: { console: { level: 'info', metrics: false, audit: false } },
};
