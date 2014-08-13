# Openelections Frontend

Web entry point for [OpenElections](http://openelections.net) project status
and data.

## Development

### Installing dependencies

This site is built using the [Jekyll](http://jekyllrb.com/) static site builder.

To install Jekyll and some other dependencies, first make sure you have gem and
bundler installed.

```
gem install bundler
```

Then use bundler to install the dependencies

```
cd ~/workspace/openelections.github.io
bundle install
```

### Building the site


To build the site, run:

```
bundle exec jekyll build
```

### Previewing the site

```
bundle exec jekyll serve --watch --baseurl '' -P 8000
```

Then you can access this project in your browser at http://localhost:8000.

## Spec

The finished product will include the following:
- Choropleth map that shows progress on collecting metadata (i.e. "not started", "in progress", "up-to-date")
- Names of each U.S. state's adopter(s)
- Count of how many elections have been covered for a particular state
- Date for when the data was last updated for a particular state
- Raw result files available for download by state, year and election type (i.e. Democratic or Republican primary, general, special, runoff)
- List of available file types for each state, year and election
- Direct link to the source for each state, year and election
- Way to download national data or all the states

## Ideas for design

- Interactive map color-coded by status
- Sidebar for displaying a state's data
    - Icons or color-coding by election type
    - Icons indicating file type
    - Dropdown menu to download all the data for a particular year or election type 
    - Filter by election type

## Notes 

### Metadata API

This will eventually be wired to live data via an endpoint of the
[OpenElections Metadata API](http://blog.openelections.net/an-improved-metadata-api/).

Here's an example request for one state's metadata:

```
GET http://openelections.net/api/v1/election/?state__postal=MD&format=json&limit=0
```

The API is built using Tastypie, so there are a number of Django-ORM-like
filters available.  For instance, if it's easier to use lower-case state
abbreviations:

```
GET http://openelections.net/api/v1/election/?state__postal__iexact=md&format=json&limit=0
```

### OpenElections Data Process

https://docs.google.com/drawings/d/1BajHKetb5-_Ap-c0RZmMUh9LsMxDX9uZLNCnzfjTZp8/edit

## Contributors

* Margie Roswell (@mroswell)
* Chloe Whiteaker
