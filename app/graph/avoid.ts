import { AvoidLib } from "libavoid-js";
import type { Point, GraphRect } from "../graph-layout";

// The upstream package's .d.ts describes older bindings. Keep the verified embind
// surface at this boundary; graph code never depends on raw C++ objects.
type Owned = {delete():void};
type NativePoint = Point & Owned;
type NativeLine = Owned & {size():number;at(i:number):NativePoint};
type NativeRouter = Owned & {
  processTransaction():void;
  setRoutingParameter(key:unknown,value:number):void;
  setRoutingOption(key:unknown,value:boolean):void;
};
type AvoidModule = {
  Point:new(x:number,y:number)=>NativePoint;
  Rectangle:new(a:NativePoint,b:NativePoint)=>Owned;
  ShapeRef:new(router:NativeRouter,rect:Owned)=>Owned;
  ConnEnd:new(point:NativePoint)=>Owned;
  ConnRef:new(router:NativeRouter,a:Owned,b:Owned)=>Owned & {setRoutingType(t:unknown):void;displayRoute():NativeLine};
  Router:new(flags:number)=>NativeRouter;
  ConnType:{ConnType_Orthogonal:unknown};
  RoutingParameter:Record<string,unknown>;
  RoutingOption:Record<string,unknown>;
};
let loading:Promise<AvoidModule>|undefined;
export async function loadAvoid(wasmUrl?:string):Promise<AvoidModule> {
  if(!loading) loading=AvoidLib.load(wasmUrl).then(()=>AvoidLib.getInstance() as AvoidModule).catch((error:unknown)=>{loading=undefined;throw error;});
  return loading;
}
export type RouteLeg={id:string;from:Point;to:Point};
/** One transaction gives libavoid the other free legs when choosing/nudging lanes. */
export async function avoidRoutes(obstacles:GraphRect[],legs:RouteLeg[],wasmUrl?:string):Promise<Map<string,Point[]>> {
  const a=await loadAvoid(wasmUrl),router=new a.Router(2);
  const temporary:Owned[]=[];
  const point=(p:Point)=>{const o=new a.Point(p.x,p.y);temporary.push(o);return o;};
  try {
    for(const [key,value] of Object.entries({segmentPenalty:40,crossingPenalty:80,shapeBufferDistance:8,idealNudgingDistance:16,reverseDirectionPenalty:100}))
      router.setRoutingParameter(a.RoutingParameter[key],value);
    router.setRoutingOption(a.RoutingOption.nudgeSharedPathsWithCommonEndPoint,false);
    router.setRoutingOption(a.RoutingOption.nudgeOrthogonalSegmentsConnectedToShapes,false);
    for(const box of obstacles) {
      const rectangle=new a.Rectangle(point(box),point({x:box.x+box.width,y:box.y+box.height}));
      temporary.push(rectangle);
      // Router owns shape and connector lifetime.
      new a.ShapeRef(router,rectangle);
    }
    const connectors=legs.map(leg=>{
      const start=new a.ConnEnd(point(leg.from)),end=new a.ConnEnd(point(leg.to));
      temporary.push(start,end);
      const connector=new a.ConnRef(router,start,end);
      connector.setRoutingType(a.ConnType.ConnType_Orthogonal);
      return {leg,connector};
    });
    router.processTransaction();
    return new Map(connectors.map(({leg,connector})=>{
      const line=connector.displayRoute();
      const points=Array.from({length:line.size()},(_,i)=>{
        const p=line.at(i);const out={x:p.x,y:p.y};p.delete();return out;
      });
      line.delete();
      return [leg.id,points];
    }));
  } finally {
    router.delete();
    temporary.reverse().forEach(o=>o.delete());
  }
}
