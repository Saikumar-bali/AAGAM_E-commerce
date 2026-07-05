import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

const openApiDocument = {
  openapi: '3.0.0',
  info: {
    title: 'AAGAM Commerce OS API',
    version: '1.0.0',
    description: 'Quick-commerce API covering auth, catalog, checkout, store fulfillment, dispatch, tracking, analytics, notifications and deployment readiness.',
  },
  servers: [
    { url: 'http://localhost:3005', description: 'Local development' },
    { url: 'https://api.example.com', description: 'Production placeholder' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'access_token' },
    },
  },
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Products' },
    { name: 'Stores' },
    { name: 'Checkout' },
    { name: 'Orders' },
    { name: 'Store Fulfillment' },
    { name: 'Dispatch' },
    { name: 'Tracking' },
    { name: 'Payments' },
    { name: 'Post Delivery' },
    { name: 'Analytics' },
    { name: 'Notifications' },
  ],
  paths: {
    '/health': { get: { tags: ['Health'], summary: 'Health check' } },
    '/ready': { get: { tags: ['Health'], summary: 'Database readiness check' } },
    '/ready/realtime': { get: { tags: ['Health'], summary: 'Redis and websocket readiness check' } },
    '/auth/signup': { post: { tags: ['Auth'], summary: 'Create customer account only' } },
    '/auth/login': { post: { tags: ['Auth'], summary: 'Login and set session cookie' } },
    '/auth/google': { post: { tags: ['Auth'], summary: 'Login with Google token' } },
    '/auth/me': { get: { tags: ['Auth'], summary: 'Current authenticated user' }, patch: { tags: ['Auth'], summary: 'Update current user profile' } },
    '/auth/logout': { post: { tags: ['Auth'], summary: 'Logout and clear session cookie' } },
    '/products': { get: { tags: ['Products'], summary: 'List products' }, post: { tags: ['Products'], summary: 'Create product, admin only' } },
    '/products/{id}': { get: { tags: ['Products'], summary: 'Get product' }, patch: { tags: ['Products'], summary: 'Update product' }, delete: { tags: ['Products'], summary: 'Soft-delete product' } },
    '/stores': { get: { tags: ['Stores'], summary: 'List stores' }, post: { tags: ['Stores'], summary: 'Create store, admin only' } },
    '/stores/my-stores': { get: { tags: ['Stores'], summary: 'Store-owner stores with inventory and orders' } },
    '/stores/{id}/inventory': { patch: { tags: ['Stores'], summary: 'Update inventory for a product in a store' } },
    '/checkout/serviceability': { get: { tags: ['Checkout'], summary: 'Check location serviceability' } },
    '/checkout/quote': { post: { tags: ['Checkout'], summary: 'Quote cart totals and availability' } },
    '/checkout/place-order': { post: { tags: ['Checkout'], summary: 'Place order' } },
    '/orders': { get: { tags: ['Orders'], summary: 'List orders by role' } },
    '/orders/my': { get: { tags: ['Orders'], summary: 'Customer orders' } },
    '/orders/my/{id}': { get: { tags: ['Orders'], summary: 'Customer order detail' } },
    '/orders/store': { get: { tags: ['Store Fulfillment'], summary: 'Store order queue' } },
    '/orders/{id}/status': { patch: { tags: ['Orders'], summary: 'Update order status' } },
    '/orders/store-fulfillment/{orderId}/items/{itemId}/unavailable': { patch: { tags: ['Store Fulfillment'], summary: 'Mark order item unavailable' } },
    '/orders/store-fulfillment/{orderId}/items/{itemId}/substitutes': { get: { tags: ['Store Fulfillment'], summary: 'List substitutes for unavailable item' } },
    '/orders/store-fulfillment/{orderId}/items/{itemId}/substitute': { patch: { tags: ['Store Fulfillment'], summary: 'Apply substitute item' } },
    '/orders/dispatch/board': { get: { tags: ['Dispatch'], summary: 'Dispatch board' } },
    '/orders/dispatch/{orderId}/assign': { post: { tags: ['Dispatch'], summary: 'Assign rider' } },
    '/orders/dispatch/{orderId}/rider/accept': { patch: { tags: ['Dispatch'], summary: 'Rider accepts assignment' } },
    '/orders/dispatch/{orderId}/rider/reject': { patch: { tags: ['Dispatch'], summary: 'Rider rejects assignment' } },
    '/orders/dispatch/{orderId}/rider/pickup': { patch: { tags: ['Dispatch'], summary: 'Rider marks picked up' } },
    '/orders/dispatch/{orderId}/rider/deliver': { patch: { tags: ['Dispatch'], summary: 'Rider completes delivery with proof' } },
    '/tracking/my/order/{orderId}': { get: { tags: ['Tracking'], summary: 'Customer tracking detail' } },
    '/tracking/rider/order/{orderId}/ping': { post: { tags: ['Tracking'], summary: 'Rider location ping' } },
    '/payments': { post: { tags: ['Payments'], summary: 'Create payment' } },
    '/payments/{paymentId}/capture': { post: { tags: ['Payments'], summary: 'Capture payment' } },
    '/orders/post-delivery/{orderId}': { get: { tags: ['Post Delivery'], summary: 'Post-delivery state' } },
    '/orders/post-delivery/{orderId}/rating': { post: { tags: ['Post Delivery'], summary: 'Submit rating' } },
    '/orders/post-delivery/{orderId}/support': { post: { tags: ['Post Delivery'], summary: 'Open support ticket' } },
    '/orders/post-delivery/support': { get: { tags: ['Post Delivery'], summary: 'Admin support queue' } },
    '/analytics/business': { get: { tags: ['Analytics'], summary: 'Admin business dashboard analytics' } },
    '/notifications/inbox': { get: { tags: ['Notifications'], summary: 'Role-scoped notification inbox' } },
    '/notifications/{sourceHistoryId}/read': { patch: { tags: ['Notifications'], summary: 'Mark notification read' } },
    '/notifications/admin/broadcast': { post: { tags: ['Notifications'], summary: 'Admin broadcast placeholder' } },
  },
};

@Controller()
export class ApiDocsController {
  @Get('api-docs-json')
  getOpenApiJson() {
    return openApiDocument;
  }

  @Get('api-docs')
  getSwaggerUi(@Res() res: Response) {
    res.type('html').send(`<!doctype html><html><head><title>AAGAM API Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" /></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>window.ui = SwaggerUIBundle({ url: '/api-docs-json', dom_id: '#swagger-ui' });</script></body></html>`);
  }
}
