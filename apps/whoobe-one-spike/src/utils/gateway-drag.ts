// Shared between GatewayPanel.vue (drag source) and BlockEditor.vue (drop
// target) for dragging a gateway field chip onto a canvas block. Deliberately
// NOT routed through the existing dragula instance (BlockEditor.vue's
// isContainer/moves/accepts are scoped to data-type="element"/"template"
// drags for inserting/reordering blocks - a third "bind a field to whatever
// element is under the cursor" drop semantics doesn't fit that model) - this
// is a plain native HTML5 drag using a custom MIME type so the two drag
// systems never interfere with each other.
export const GATEWAY_FIELD_DRAG_MIME_TYPE = 'application/x-whoobe-gateway-field'

export interface GatewayFieldDragPayload {
  endpointName: string
  routePath: string
  fieldPath: string
}
