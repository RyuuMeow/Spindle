import ELK from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "../../node_modules/elkjs/lib/elk-worker.min.js?url";
import { computeLayout } from "./layout-engine";
import wasmUrl from "../../node_modules/libavoid-js/dist/libavoid.wasm?url";
import type { GraphLayoutRequest } from "./layout-state";
const elk=new ELK({workerUrl:elkWorkerUrl});
const scope=self as unknown as {onmessage:((event:MessageEvent<GraphLayoutRequest>)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=async(event)=>{
  try{scope.postMessage(await computeLayout(event.data,wasmUrl,elk));}
  catch(error){scope.postMessage({id:event.data.id,modelVersion:event.data.modelVersion,layoutVersion:event.data.layoutVersion,error:error instanceof Error?error.message:String(error)});}
};
