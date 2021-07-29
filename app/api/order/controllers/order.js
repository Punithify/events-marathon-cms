"use strict";
const { parseMultipartData, sanitizeEntity, finder } = require("strapi-utils");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */

const fromDecimalToInt = (number) => parseInt(number * 100);

module.exports = {
  async find(ctx) {
    const { user } = ctx.state;
    let entites;
    if (ctx.query._q) {
      entites = await strapi.services.order.search({
        ...ctx.query,
        user: user.id,
      });
    } else {
      entites = await strapi.services.order.find({
        ...ctx.query,
        user: user.id,
      });
    }
    return entites.map((entity) =>
      sanitizeEntity(entity, { model: strapi.models.order })
    );
  },
  async findOne(ctx) {
    const { id } = ctx.params;
    const { user } = ctx.state;
    const entity = await strapi.services.order.findOne({ id, user: user.id });
    return sanitizeEntity(entity, { model: strapi.models.order });
  },
  //create a order
  async create(ctx) {
    const { event } = ctx.request.body;

    if (!event) {
      return ctx.throw(400, "Please choose a event");
    }

    const realEvent = await strapi.services.events.findOne({ id: event.id });
    if (!realEvent) {
      return ctx.throw(404, "No event as such");
    }
    const { user } = ctx.state;
    const BASE_URL = ctx.request.headers.origin || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: user.email,
      mode: "payment",
      success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: BASE_URL,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: realEvent.name,
            },
            unit_amount: fromDecimalToInt(realEvent.price),
          },
          quantity: 1,
        },
      ],
    });

    const newOrder = await strapi.services.order.create({
      user: user.id,
      event: realEvent.id,
      total: realEvent.price,
      status: "unpaid",
      checkout_session: session.id,
    });

    return { id: session.id };
  },
  //verify payment and change status
  async confirm(ctx) {
    const { checkout_session } = ctx.request.body;
    const session = await stripe.checkout.sessions.retrieve(checkout_session);
    console.log(session.payment_status);
    if (session.payment_status === "paid") {
      const updateOrder = await strapi.services.order.update(
        {
          checkout_session,
        },
        { status: "paid" }
      );
      return sanitizeEntity(updateOrder, { model: strapi.models.order });
    } else {
      ctx.throw(400, "The payment wasnot suessful,please call support");
    }
  },
};
