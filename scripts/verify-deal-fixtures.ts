import { verifyFiles } from "../fixtures/lib/verify";
verifyFiles()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
