const fs = require("fs-extra");
const path = require("path");
const csv = require("csvtojson");
const metascraper = require("metascraper")([
  require("./rules/metascraper-description")(),
  require("./rules/metascraper-image")(),
  require("./rules/metascraper-title")(),
  require("./rules/metascraper-url")(),
]);
const argv = require("minimist")(process.argv.slice(2));
const allSettled = require("promise.allsettled");
const got = require("got");

const urlRegEx = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
const { input, output } = argv;

if (!input) {
  console.error("Must include input csv file.");
  return;
}

if (!output) {
  console.error("Must include output csv file.");
  return;
}

const csvFilePath = path.join(__dirname, input);

const getMetaData = async targetUrl => {
  const { body: html, url } = await got(targetUrl);
  let metadata;

  try {
    metadata = await metascraper({ html, url });
  } catch (error) {
    return null;
  }

  return metadata;
};

csv()
  .fromFile(csvFilePath)
  .then(async jsonObj => {
    const rawTweets = jsonObj;
    const metaDataPromises = rawTweets.map(async tweet => {
      const url = tweet.text.match(urlRegEx);

      return url ? await getMetaData(url[0]) : null;
    });
    let tweetMetaData;

    try {
      tweetMetaData = await allSettled(metaDataPromises);

      const newTweetsData = rawTweets.map((tweet, index) => {
        const tweetMeta = tweetMetaData[index];

        if (tweetMeta.value) {
          return {
            ...tweet,
            metadata: {
              description: tweetMeta.value.description,
              image: tweetMeta.value.image,
              title: tweetMeta.value.title,
              url: tweetMeta.value.url,
            },
          };
        } else {
          return tweet;
        }
      });

      const outputFilePath = path.join(__dirname, output);

      try {
        await fs.outputFile(
          outputFilePath,
          "const tweets =" +
            JSON.stringify(newTweetsData) +
            "; export default tweets"
        );
      } catch (error) {
        console.error(error.message);
      }
    } catch (error) {
      console.log(error.message);
    }
  })
  .catch(error => {
    console.error(error.message);
  });
