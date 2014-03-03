Notes: 

Sample URL for election results metadata API: 
http://openelections.net/api/v1/election/?state__postal__iexact=md&format=json&limit=0

 or 

http://openelections.net/api/v1/election/?state__postal=MD&format=json&limit=0

The finished product will include the following:
- Choropleth map that shows progress on collecting metadata (i.e. "not started", "in progress", "up-to-date")
- Names of each U.S. state's adopter(s)
- Count of how many elections have been covered for a particular state
- Date for when the data was last updated for a particular state
- Raw result files available for download by state, year and election type (i.e. demoratic or republican primary, general, special, runoff)
- List of available file types for each state, year and election
- Direct link to the source for each state, year and election
- Way to download national data or all the states

Ideas for design:
- Interactive map color-coded by status
- Sidebar for displaying a state's data
    - Icons or color-coding by election type
    - Icons indicating file type
    - Dropdown menu to download all the data for a particular year or election type 
    - Filter by election type

OpenElections Data Process:
https://docs.google.com/drawings/d/1BajHKetb5-_Ap-c0RZmMUh9LsMxDX9uZLNCnzfjTZp8/edit
