# Objects list: list view and table view

The *Objects* screen of a class shows its records either as the compact **list** or as a spreadsheet-like **table**. The switch is in the
toolbar (list / table icons, next to *Filter*). The choice is remembered per class in the browser; without one, the class's own default
applies (below).

## Opening, editing and deleting a record

A click on a row does nothing. **Right click** a row for the menu *Edit* / *Copy id* / *Delete* (*Copy id* puts the record's id on the
clipboard: it is the `<id>` of `/client/v1/data/<class>/<id>` for an API client; a long press on a touch screen that sends the
context-menu event; Safari on iOS does not).

## Table view

- Cell borders, row numbers, one line per row, small thumbnails for image fields.
- **Resize a column** by dragging the right edge of its header; double click the edge to reset it. The widths are remembered per class
  and browser. When the columns do not fit, the table scrolls sideways and the header scrolls with it.
- **Edit in the cell**: double click it. Enter keeps the value, Esc cancels. A checkbox toggles at once. Editable: the record key and
  fields of type text (input, textarea, email, URL slug), number, date, checkbox and select with options. Relations, images and
  files, rich text, arrays and objects are edited in the record.
- Nothing is saved while you type. A changed cell is tinted and a bar appears under the table: **Discard**, or **Save changes**
  with two options: **Save**, and **Save & Publish** (also sets the record to published). A cell the server refused (for instance a
  duplicate in a *unique* field) is marked red with the message as its tooltip; the other rows are saved.
- Only the row shown (the first locale of a record) is edited. Switching class discards unsaved edits; closing the page asks first.

## Make the table the default of a class

*Settings > Classes > the class > List Layout > Set Table view as default* (stored as `viewConfig.defaultListView: "table"`). It applies
to everybody who has not picked a view for that class in their own browser.
