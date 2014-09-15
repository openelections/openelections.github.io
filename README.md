# Openelections Frontend

Website for the [OpenElections](http://openelections.net) project.  It displays project status and offers an interface to download results data.

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

## Updating metadata

Information about the project status and the availability of downloadable results for individual elections is stored in JSON files in the ``data`` directory.  These files will sometimes need to be updated from data in the [dashboard](https://github.com/openelections/dashboard) and [core](https://github.com/openelections/core) apps.

These tasks can be run either within the environment of these apps, or remotely, using Fabric tasks in the ``openelex-config`` repo.

#### Updating the state status metadata

To update the ``state_status.json`` file, which drives the map and table on the home page and the state status in the sidebar, do one of the following:

From the dashboard app's environment, run:

```
django-admin.py create_status_json > /path/to/data/state_status.json
```

or using Fabric, run:

```
fab -R prod create_status_json:outputfilename=/path/to/data/state_status.json
```

### Updating the election results availability metadata

The election results availability files are stored as ``data/elections-{state_abbrev}.json``.  This data drives the elections visualization and download table for each state.

To generate the election results availability for a state, the data for the elections needs to be loaded into the database.  Then, do one of the following:

From the core app's environment, run:

```
inv bake.results_status_json --state=WY > /path/to/data/elections-wy.json
```

or using Fabric, run:

```
fab -R prod bake_results_status_json:state=WY,outputfilename=/path/to/data/elections-wy.json
```

In either case, replace "WY" with the abbreviation of the state whose metadata you want to generate.

## Contributors

* Margie Roswell (@mroswell)
* Chloe Whiteaker
