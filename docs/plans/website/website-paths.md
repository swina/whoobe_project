# Website Paths

Website paths are the logic implementation for routing.
Since the CMS relates on database, paths could be dynamic. By default and in order to make SEO friendly paths, paths are built on this logic:
- static paths: e.g. /it/news (normally list of records page)
- dynamic path: /it/news/[identifier] (normally a single record page)

## Saving dynamic paths

The easiest way to create dynamic paths is to add an identifier included in graphs like:

`/it/news/{slug}`

where slug is the identifier that corresponds to a data object field.

So, in the data binding the Dynamic Query, settings a filter to a field with slug = {slug}, the system should automatically and dynamically bind the data of the record that satisfy the query filter.
The path becomes the way to identify a single record.

## How to link to a dynamic path from a list of records page?

From the data binding any data should have the option when listed to link to it's dynamic path. For example binding a list of news of a page linked to a path `/it/news-ed-eventi`, every record listed should have the possibility to link (clicking on the record container or adding a button/link) to a it's dynamic path that will be:

`/it/news-ed-eventi/{slug}`

Dynamic paths can be updated by the user.
