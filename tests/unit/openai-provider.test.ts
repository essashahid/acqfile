import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createOpenAiProvider } from "@/lib/llm/openai";
const items = [{fieldPath:"report_title",fieldDefinition:"Title",candidateValue:"Synthetic report",evidence:[],context:[]}];
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const provider = () => createOpenAiProvider({ apiKey:"test-key", baseURL:"https://openai.example.test/v1", models:{extract:"gpt-5.6-luna",verify:"gpt-5.6-terra"} });
function response(text: string) { return HttpResponse.json({id:"resp_test",object:"response",created_at:1,status:"completed",model:"gpt-5.6-luna",output:[{id:"msg_test",type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text,annotations:[]}]}],usage:{input_tokens:10,output_tokens:5,total_tokens:15}}); }
it("retries malformed structured output once and retains usage from both responses", async()=>{
  let calls=0;
  server.use(http.post('https://openai.example.test/v1/responses',()=>response(++calls===1?'not json':JSON.stringify({items:[{index:0,status:'supported',corrected_value:null,contradiction_detected:false,evidence_specificity:1,reason:'Source states value'}]}))));
  const result=await provider().verify(items);
  expect(calls).toBe(2);
  expect(result.usage.inputTokens).toBe(20);
  expect(result.usage.outputTokens).toBe(10);
});
it("surfaces rate limits as retryable pipeline failures", async()=>{
  server.use(http.post('https://openai.example.test/v1/responses',()=>HttpResponse.json({error:{message:'Rate limited',type:'rate_limit_error'}},{status:429})));
  await expect(provider().verify(items)).rejects.toMatchObject({code:'rate_limited',retryable:true});
});
