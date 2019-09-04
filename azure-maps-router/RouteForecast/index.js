let https = require('https')

module.exports = function(context, req) {
  let origin         = req.query.origin         || (req.body && req.body.origin)
  let destination    = req.query.destination    || (req.body && req.body.destination)
  let includeAlts    = req.query.includeAlts    || (req.body && req.body.includeAlts)
  let azureMapsKey   = req.query.azureMapsKey   || (req.body && req.body.azureMapsKey)
  let forecastAPIKey = req.query.forecastAPIKey || (req.body && req.body.forecastAPIKey)

  let nowSec = Math.round((new Date).getTime() / 1000)

  context.log("RouteForecast request: origin="+origin+" destination="+destination)

  let azureMapsPath = "/route/directions/json?api-version=1.0&query=" +
      origin + ":" + destination + "&subscription-key=" + azureMapsKey

  let requestOptions = {
    host: "atlas.microsoft.com",
    path: azureMapsPath
  }

  let azureMapsRequest = https.get(requestOptions, (resp) => {
    let azureMapsAPIBody = ""
    resp.on("data", (chunk) => {
      azureMapsAPIBody += chunk
    })
    resp.on("end", () => {
      let azureMapsResponse = JSON.parse(azureMapsAPIBody)
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

      // TODO: accept list of forecast variables as a parameter
      let data = JSON.stringify({variables: [{"name":"Temperature","level":"Surface"}],
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

      let forecastAPIRequest = https.request(options, (res) => {
        let forecastAPIBody = ""
        res.on("data", (chunk) => {
          forecastAPIBody += chunk
        })
        res.on("end", () => {
          let forecastAPIResponse = JSON.parse(forecastAPIBody)
          let outData = []
          for( let i=0; i<pointData.length; i++) {
            outData[i] = {
              lat: pointData[i].lat,
              lng: pointData[i].lng,
              // TODO: assumption here, that there is only one variable
              values: [{value: forecastAPIResponse[0].values[i],
                        var: {name: forecastAPIResponse[0].name,
                              level: forecastAPIResponse[0].level}}],
              "absolute-seconds": pointData[i]["relative-seconds"] + nowSec
            }
          }

          // Final, successful, return
          context.done(null, {body: JSON.stringify(outData),
                              headers: {"Content-Type": "application/json"}})
        })
      })
      forecastAPIRequest.on("error", (error) => {
        console.error(error)
      })
      forecastAPIRequest.write(data)
      forecastAPIRequest.end()
    })
  }).on("error", (error) => {
    context.done(null, {
      status: 500,
      body: error
    })
  })
  azureMapsRequest.end()
}
