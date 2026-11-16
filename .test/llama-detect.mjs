import { createMarkerRuntime } from '../host/marker.js'
const rt = createMarkerRuntime({})
const vlm = await rt.checkVlm(true)
console.log('checkVlm:', JSON.stringify(vlm))
const env = await rt.probe(true)
console.log('env.vlm:', JSON.stringify(env.vlm))
