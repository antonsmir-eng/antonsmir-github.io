import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';

export const users=sqliteTable('cabinet_users',{
 id:text('id').primaryKey(),email:text('email').notNull(),login:text('login').notNull(),passwordHash:text('password_hash').notNull(),
 role:text('role').notNull().default('customer'),name:text('name').notNull(),phone:text('phone').notNull().default(''),company:text('company').notNull().default(''),inn:text('inn').notNull().default(''),address:text('address').notNull().default(''),
 mustChangePassword:integer('must_change_password').notNull().default(0),createdAt:integer('created_at').notNull()
},t=>[uniqueIndex('cabinet_users_email').on(t.email),uniqueIndex('cabinet_users_login').on(t.login)]);
export const sessions=sqliteTable('cabinet_sessions',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),expiresAt:integer('expires_at').notNull(),createdAt:integer('created_at').notNull()
},t=>[index('cabinet_sessions_user').on(t.userId)]);
export const limits=sqliteTable('cabinet_auth_limits',{
 key:text('key').primaryKey(),attempts:integer('attempts').notNull(),expiresAt:integer('expires_at').notNull()
});
export const orders=sqliteTable('cabinet_orders',{
 id:text('id').primaryKey(),requestId:text('request_id').notNull(),userId:text('user_id').notNull().references(()=>users.id),number:text('number').notNull(),
 title:text('title').notNull(),details:text('details_json').notNull(),status:text('status').notNull().default('draft'),budget:integer('budget').notNull(),
 quote:integer('quote'),quoteNote:text('quote_note').notNull().default(''),paymentStatus:text('payment_status').notNull().default('unpaid'),
 version:integer('version').notNull().default(1),changeId:text('change_id').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[uniqueIndex('cabinet_orders_request').on(t.userId,t.requestId),uniqueIndex('cabinet_orders_number').on(t.number),index('cabinet_orders_owner_created').on(t.userId,t.createdAt),index('cabinet_orders_status_created').on(t.status,t.createdAt)]);
export const events=sqliteTable('cabinet_order_events',{
 id:text('id').primaryKey(),orderId:text('order_id').notNull().references(()=>orders.id),actorId:text('actor_id').notNull().references(()=>users.id),
 title:text('title').notNull(),note:text('note').notNull().default(''),createdAt:integer('created_at').notNull()
},t=>[index('cabinet_events_order').on(t.orderId,t.createdAt)]);
export const files=sqliteTable('cabinet_files',{
 id:text('id').primaryKey(),orderId:text('order_id').notNull().references(()=>orders.id),ownerId:text('owner_id').notNull().references(()=>users.id),
 name:text('name').notNull(),size:integer('size').notNull(),contentType:text('content_type').notNull(),objectKey:text('object_key').notNull(),createdAt:integer('created_at').notNull()
},t=>[index('cabinet_files_order').on(t.orderId)]);
export const payments=sqliteTable('cabinet_payments',{
 id:text('id').primaryKey(),orderId:text('order_id').notNull().references(()=>orders.id),amount:integer('amount').notNull(),
 provider:text('provider').notNull(),providerId:text('provider_id'),idempotencyKey:text('idempotency_key').notNull(),status:text('status').notNull(),
 confirmationUrl:text('confirmation_url'),reference:text('reference').notNull().default(''),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[uniqueIndex('cabinet_payments_provider_id').on(t.providerId),uniqueIndex('cabinet_payments_key').on(t.idempotencyKey),index('cabinet_payments_order').on(t.orderId,t.createdAt),uniqueIndex('cabinet_payments_active').on(t.orderId).where(sql`provider='yookassa' AND status IN ('creating','pending','waiting_for_capture')`)]);
export const settings=sqliteTable('cabinet_settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const articles=sqliteTable('cabinet_articles',{
 slug:text('slug').primaryKey(),title:text('title').notNull(),excerpt:text('excerpt').notNull(),category:text('category').notNull(),body:text('body').notNull(),status:text('status',{enum:['draft','published']}).notNull().default('draft'),publishedAt:integer('published_at').notNull().default(0),updatedAt:integer('updated_at').notNull(),
},t=>[index('cabinet_articles_status').on(t.status,t.publishedAt)]);
