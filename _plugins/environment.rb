# _plugins/environment.rb
# Plugin to expose environment variables to Jekyll

module Jekyll
  class EnvironmentVariablesGenerator < Generator
    def generate(site)
      site.config['github_token'] = ENV['GITHUB_TOKEN'] || ''
    end
  end
end
