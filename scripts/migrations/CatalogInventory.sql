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
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    CREATE TABLE [Categories] (
        [CategoryId] uniqueidentifier NOT NULL,
        [Name] nvarchar(140) NOT NULL,
        [ParentCategoryId] uniqueidentifier NULL,
        CONSTRAINT [PK_Categories] PRIMARY KEY ([CategoryId]),
        CONSTRAINT [FK_Categories_Categories_ParentCategoryId] FOREIGN KEY ([ParentCategoryId]) REFERENCES [Categories] ([CategoryId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
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
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    CREATE TABLE [Products] (
        [ProductId] uniqueidentifier NOT NULL,
        [Sku] nvarchar(60) NOT NULL,
        [Name] nvarchar(200) NOT NULL,
        [Description] nvarchar(2000) NOT NULL,
        [CategoryId] uniqueidentifier NOT NULL,
        [UnitPrice] decimal(18,2) NOT NULL,
        [MinOrderQty] int NOT NULL,
        [TotalStock] int NOT NULL,
        [ReservedStock] int NOT NULL,
        [IsActive] bit NOT NULL,
        [ImageUrl] nvarchar(500) NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_Products] PRIMARY KEY ([ProductId]),
        CONSTRAINT [FK_Products_Categories_CategoryId] FOREIGN KEY ([CategoryId]) REFERENCES [Categories] ([CategoryId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    CREATE TABLE [StockSubscriptions] (
        [StockSubscriptionId] uniqueidentifier NOT NULL,
        [DealerId] uniqueidentifier NOT NULL,
        [ProductId] uniqueidentifier NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_StockSubscriptions] PRIMARY KEY ([StockSubscriptionId]),
        CONSTRAINT [FK_StockSubscriptions_Products_ProductId] FOREIGN KEY ([ProductId]) REFERENCES [Products] ([ProductId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    CREATE TABLE [StockTransactions] (
        [TxId] uniqueidentifier NOT NULL,
        [ProductId] uniqueidentifier NOT NULL,
        [TransactionType] nvarchar(40) NOT NULL,
        [Quantity] int NOT NULL,
        [ReferenceId] nvarchar(120) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_StockTransactions] PRIMARY KEY ([TxId]),
        CONSTRAINT [FK_StockTransactions_Products_ProductId] FOREIGN KEY ([ProductId]) REFERENCES [Products] ([ProductId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Categories_ParentCategoryId] ON [Categories] ([ParentCategoryId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Products_CategoryId] ON [Products] ([CategoryId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Products_Sku] ON [Products] ([Sku]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_StockSubscriptions_DealerId_ProductId] ON [StockSubscriptions] ([DealerId], [ProductId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_StockSubscriptions_ProductId] ON [StockSubscriptions] ([ProductId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_StockTransactions_ProductId] ON [StockTransactions] ([ProductId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174540_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260328174540_InitialCreate', N'10.0.5');
END;

COMMIT;
GO

