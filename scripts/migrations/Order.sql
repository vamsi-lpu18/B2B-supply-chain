IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174554_InitialCreate'
)
BEGIN
    CREATE TABLE [Orders] (
        [OrderId] uniqueidentifier NOT NULL,
        [OrderNumber] nvarchar(32) NOT NULL,
        [DealerId] uniqueidentifier NOT NULL,
        [Status] nvarchar(40) NOT NULL,
        [TotalAmount] decimal(18,2) NOT NULL,
        [CreditHoldStatus] nvarchar(40) NOT NULL,
        [PaymentMode] nvarchar(20) NOT NULL,
        [PlacedAtUtc] datetime2 NOT NULL,
        [CancellationReason] nvarchar(400) NULL,
        CONSTRAINT [PK_Orders] PRIMARY KEY ([OrderId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174554_InitialCreate'
)
BEGIN
    CREATE TABLE [OutboxMessages] (
        [MessageId] uniqueidentifier NOT NULL,
        [EventType] nvarchar(200) NOT NULL,
        [Payload] nvarchar(max) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [PublishedAtUtc] datetime2 NULL,
        [RetryCount] int NOT NULL,
        [Error] nvarchar(2000) NULL,
        CONSTRAINT [PK_OutboxMessages] PRIMARY KEY ([MessageId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174554_InitialCreate'
)
BEGIN
    CREATE TABLE [OrderLines] (
        [OrderLineId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [ProductId] uniqueidentifier NOT NULL,
        [ProductName] nvarchar(220) NOT NULL,
        [Sku] nvarchar(60) NOT NULL,
        [Quantity] int NOT NULL,
        [UnitPrice] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_OrderLines] PRIMARY KEY ([OrderLineId]),
        CONSTRAINT [FK_OrderLines_Orders_OrderId] FOREIGN KEY ([OrderId]) REFERENCES [Orders] ([OrderId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174554_InitialCreate'
)
BEGIN
    CREATE TABLE [OrderStatusHistory] (
        [HistoryId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [FromStatus] nvarchar(40) NOT NULL,
        [ToStatus] nvarchar(40) NOT NULL,
        [ChangedByUserId] uniqueidentifier NOT NULL,
        [ChangedByRole] nvarchar(40) NOT NULL,
        [ChangedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_OrderStatusHistory] PRIMARY KEY ([HistoryId]),
        CONSTRAINT [FK_OrderStatusHistory_Orders_OrderId] FOREIGN KEY ([OrderId]) REFERENCES [Orders] ([OrderId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174554_InitialCreate'
)
BEGIN
    CREATE TABLE [ReturnRequests] (
        [ReturnRequestId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [RequestedByDealerId] uniqueidentifier NOT NULL,
        [Reason] nvarchar(500) NOT NULL,
        [RequestedAtUtc] datetime2 NOT NULL,
        [IsApproved] bit NOT NULL,
        [IsRejected] bit NOT NULL,
        [ReviewedAtUtc] datetime2 NULL,
        CONSTRAINT [PK_ReturnRequests] PRIMARY KEY ([ReturnRequestId]),
        CONSTRAINT [FK_ReturnRequests_Orders_OrderId] FOREIGN KEY ([OrderId]) REFERENCES [Orders] ([OrderId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174554_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_OrderLines_OrderId] ON [OrderLines] ([OrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174554_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Orders_OrderNumber] ON [Orders] ([OrderNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174554_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_OrderStatusHistory_OrderId] ON [OrderStatusHistory] ([OrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174554_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ReturnRequests_OrderId] ON [ReturnRequests] ([OrderId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174554_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260328174554_InitialCreate', N'10.0.5');
END;

COMMIT;
GO

