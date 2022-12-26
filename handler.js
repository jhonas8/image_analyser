"use strict";

const { get } = require("axios");

const log = (text) => console.log(text);

class Handler {
  constructor({ rekoSvc, translatorSvc }) {
    this.rekoSvc = rekoSvc;
    this.translatorSvc = translatorSvc;
  }

  async getImageBuffer(imageUrl) {
    const response = await get(imageUrl, {
      responseType: "arraybuffer",
    });
    const buffer = Buffer.from(response.data, "base64");

    return buffer;
  }

  async detectImageLabels(buffer) {
    const result = await this.rekoSvc
      .detectLabels({
        Image: {
          Bytes: buffer,
        },
      })
      .promise();

    const items = result.Labels.filter(({ Confidence }) => Confidence > 80);
    const names = items.map(({ Name }) => Name).join(" and ");

    return { items, names };
  }

  async translateText(text, lang) {
    const params = {
      SourceLanguageCode: "en",
      TargetLanguageCode: lang,
      Text: text,
    };

    const { TranslatedText } = await this.translatorSvc
      .translateText(params)
      .promise();

    const translatedDelimiter = await this.translatorSvc
      .translateText({
        SourceLanguageCode: "en",
        TargetLanguageCode: lang,
        Text: "and",
      })
      .promise();

    return TranslatedText.split(` ${translatedDelimiter.TranslatedText} `);
  }

  formatTextResults(names, items) {
    const finalText = [];

    for (const index in items) {
      const name = names[index];
      const confidence = items[index].Confidence;

      finalText.push(`${confidence.toFixed(2)}% de chances de ser ${name}\n`);
    }

    return finalText;
  }

  async main(event) {
    try {
      const { imageUrl, lang } = event.queryStringParameters;

      if (!lang) throw new Error({ message: "lang parameter is missing" });

      log("Downloading the image...");
      const buffer = await this.getImageBuffer(imageUrl);

      log("Detecting labels...");
      const response = await this.detectImageLabels(buffer);

      log("Translating language...");
      const texts = await this.translateText(response.names, lang);

      log("Handling the final object...");
      const finalText = this.formatTextResults(texts, response.items);

      log("Finishing...");

      return {
        statusCode: 200,
        body: `A imagem tem \n `.concat(finalText),
      };
    } catch (err) {
      return {
        statusCode: 500,
        body: `A error has occurred: ${err.message}`,
      };
    }
  }
}

const aws = require("aws-sdk");
const reko = new aws.Rekognition();
const translator = new aws.Translate();

const handler = new Handler({
  rekoSvc: reko,
  translatorSvc: translator,
});

module.exports.main = handler.main.bind(handler);
