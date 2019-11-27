let https = require('https')

function fail(context, message) {
  context.done(null, {
    status: 500,
    body: message
  })
}

function dot(v1, v2) {
  return v1[0]*v2[0]+v1[1]*v2[1]
}

module.exports = function(context, req) {
  let origin         = req.query.origin         || (req.body && req.body.origin)
  let destination    = req.query.destination    || (req.body && req.body.destination)
  let departAt       = req.query.departAt       || (req.body && req.body.departAt)
  let includeAlts    = req.query.includeAlts    || (req.body && req.body.includeAlts)
  let azureMapsKey   = req.query.azureMapsKey   || (req.body && req.body.azureMapsKey)
  let forecastAPIKey = req.query.forecastAPIKey || (req.body && req.body.forecastAPIKey)

  let nowSec = Math.round((new Date).getTime() / 1000)
  let departAtSec = parseInt(departAt)

  let departAtChunk = "";
  if( departAtSec > (120+nowSec) )
    departAtChunk = "&departAt=" + (new Date(1000*departAtSec)).toISOString()

  context.log("RouteForecast request: origin="+origin+" destination="+destination)

  let azureMapsPath = "/route/directions/json?api-version=1.0&query=" +
      origin + ":" + destination + departAtChunk + "&subscription-key=" + azureMapsKey

  let requestOptions = {
    host: "atlas.microsoft.com",
    path: azureMapsPath
  }

  let timeMapStart = new Date
  let azureMapsRequest = https.get(requestOptions, (resp) => {
    let azureMapsAPIBody = ""
    resp.on("data", (chunk) => {
      azureMapsAPIBody += chunk
    })
    resp.on("end", () => {
      let mapTimeMs = new Date - timeMapStart
      let azureMapsResponse = JSON.parse(azureMapsAPIBody)
      if(!azureMapsResponse.routes) {
        fail(context, "No route found.")
        return
      }
      let route = azureMapsResponse.routes[0]
      let timeSec = route.summary.travelTimeInSeconds
      let points = route.legs[0].points
      let pointCount = points.length
      let lastSeenMinute = 0

      // Sample route data down to one point per minute.
      let pointData = []
      for(let i=0; i<pointCount-1; i++) {
        let t = Math.round(timeSec * (i/pointCount))
        if( t >= lastSeenMinute ) {
          pointData.push({lat: points[i].latitude,
                          lng: points[i].longitude,
                          "relative-seconds": t})
          lastSeenMinute += 60
        }
      }
      pointData.push({lat: points[pointCount-1].latitude,
                      lng: points[pointCount-1].longitude,
                      "relative-seconds": timeSec})

      let data = JSON.stringify({variables: [{"name":"Temperature","level":"Surface"},
                                             {"name":"RoadTemperature","level":"Surface"},
                                             {"name":"RoadState","level":"Surface"},
                                             {"name":"RouteDelayRisk","level":"Surface"},
                                             {"name":"PrecipitationRate","level":"Surface"},
                                             {"name":"SnowDepth", "level":"Surface"},
                                             {"name":"WindSpeed","level":"10Meters"},
                                             {"name":"WindDirection","level":"10Meters"}],
                                 points: pointData})

      let options = {
        hostname: "fathym-forecast-int.azure-api.net",
        path: "/api/v0/point-query",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
          "Ocp-Apim-Subscription-Key": forecastAPIKey
        }
      }

      let timeForecastStart = new Date
      let forecastAPIRequest = https.request(options, (res) => {
        let forecastAPIBody = ""
        res.on("data", (chunk) => {
          forecastAPIBody += chunk
        })
        res.on("end", () => {
          let forecastTimeMs = new Date - timeForecastStart
          let outData = {points: []}
          let forecastResponse = JSON.parse(forecastAPIBody)
          outData.forecast = {surfaceTemperature: forecastResponse[0].values,
                              roadTemperature:    forecastResponse[1].values,
                              roadState:          forecastResponse[2].values,
                              routeDelayRisk:     forecastResponse[3].values,
                              precipitationRate:  forecastResponse[4].values,
                              snowDepth:          forecastResponse[5].values,
                              windSpeed:          forecastResponse[6].values,
                              windDirection:      forecastResponse[7].values}
          let crosswindRisk = []
          for( let i=0; i<pointData.length-1; i++) {
            let travelDirection = [pointData[i+1].lng - pointData[i].lng,
                                   pointData[i+1].lat - pointData[i].lat]
            let windDirection = [Math.sin(outData.forecast.windDirection[i]),
                                 Math.cos(outData.forecast.windDirection[i])]
            let crosswind = Math.abs(dot(travelDirection, windDirection))
            let normalizedWindSpeed = Math.min(outData.forecast.windSpeed[i], 20) / 10.0
            crosswindRisk[i] = (1-crosswind)*normalizedWindSpeed
          }
          crosswindRisk[crosswindRisk.length-1] = crosswindRisk[crosswindRisk.length-2]
          outData.forecast.crosswindRisk = crosswindRisk

          for( let i=0; i<pointData.length; i++) {
            outData.points[i] = {
              lat: pointData[i].lat,
              lng: pointData[i].lng,
              "absoluteSeconds": pointData[i]["relative-seconds"] + nowSec
            }
          }

          context.log("RouteForecast complete: point-count=" + outData.points.length +
                      " mapTimeMs=" + mapTimeMs + " forecastTimeMS=" + forecastTimeMs)

          // Final, successful, return
          context.done(null, {body: JSON.stringify(outData),
                              headers: {"Content-Type": "application/json",
                                        "Access-Control-Allow-Origin": "*"}})
        })
      })
      forecastAPIRequest.on("error", (error) => {
        console.error(error)
      })
      forecastAPIRequest.write(data)
      forecastAPIRequest.end()
    })
  }).on("error", (error) => {
    fail(context, error)
  })
  azureMapsRequest.end()
}
