const fetch = require("node-fetch")
const table = require("table")

let forecastAPIKey = process.env.FORECAST_API_KEY
if( !(typeof forecastAPIKey === "string") || forecastAPIKey.length == 0 )
  throw("Missing environment variable: FORECAST_API_KEY")

let nowMillis = (new Date).getTime()

let lat = 40.021296
let lng = -105.264607
let points = []
let fiveMinutesInSeconds = 60*5
// Every five minutes for the next 12 hours (twelve points per hour)
for( let i=0; i<12*12; i++ ) {
  points.push({lat: lat,
               lng: lng,
               "relative-seconds": fiveMinutesInSeconds * i})
}

const body = {variables: [{"name":"Temperature","level":"Surface"},
                          {"name":"RoadTemperature","level":"Surface"},
                          {"name":"RoadState","level":"Surface"},
                          {"name":"RouteDelayRisk","level":"Surface"},
                          {"name":"PrecipitationRate","level":"Surface"},
                          {"name":"SnowDepth","level":"Surface"},
                          {"name":"WindSpeed","level":"10Meters"},
                          {"name":"WindDirection","level":"10Meters"}],
              points: points}

function jsonToTableData(json) {
  tableData = []
  headerRow = ["time"]
  for( let i=0; i<json.length; i++ )
    headerRow.push(json[i].name)
  tableData.push(headerRow)

  for( let i=0; i<json[0].values.length; i++ ) {
    let t = points[i]["relative-seconds"]*1000+nowMillis
    let row = [(new Date(t)).toTimeString()]
    for( let j=0; j<json.length; j++ )
      row.push(json[j].values[i])
    tableData.push(row)
  }

  return tableData
}

function printJsonAsTable(json) {
  let options = {drawHorizontalLine: (i,size) => {return i==0 || i==1 || i==size}}
  console.log(table.table(jsonToTableData(json), options))
}

fetch("https://fathym-forecast-int.azure-api.net/api/v0/point-query", {
  method: "post",
  body:    JSON.stringify(body),
  headers: {"Content-Type": "application/json",
            "Ocp-Apim-Subscription-Key": forecastAPIKey}
}).then(res => res.json())
  .then(json => printJsonAsTable(json))
