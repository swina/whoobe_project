# Whoobe Editor Data Query Binding

The pages editor (whoobe-one-spike) can automatically create data binding. At the moment the data binding is related to an object (a single record/row).
Develop a feature that:
- given a root container, associate it to a data object query (the option is present but not for binding list of data) with pagination settings (limits per root container)
- bind the child container is automatically to the root container query
- the user can add fields related to the data object/query set in the root container
- the output (preview will automatically bind the data based on the query and the fields set in the child container/elements)