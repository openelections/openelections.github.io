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

## Contributors

* Margie Roswell (@mroswell)
* Chloe Whiteaker
