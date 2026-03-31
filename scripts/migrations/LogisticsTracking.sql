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
    WHERE [MigrationId] = N'20260328174620_InitialCreate'
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
    WHERE [MigrationId] = N'20260328174620_InitialCreate'
)
BEGIN
    CREATE TABLE [Shipments] (
        [ShipmentId] uniqueidentifier NOT NULL,
        [OrderId] uniqueidentifier NOT NULL,
        [DealerId] uniqueidentifier NOT NULL,
        [ShipmentNumber] nvarchar(32) NOT NULL,
        [DeliveryAddress] nvarchar(500) NOT NULL,
        [City] nvarchar(100) NOT NULL,
        [State] nvarchar(100) NOT NULL,
        [PostalCode] nvarchar(12) NOT NULL,
        [AssignedAgentId] uniqueidentifier NULL,
        [Status] nvarchar(32) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [DeliveredAtUtc] datetime2 NULL,
        CONSTRAINT [PK_Shipments] PRIMARY KEY ([ShipmentId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174620_InitialCreate'
)
BEGIN
    CREATE TABLE [ShipmentEvents] (
        [ShipmentEventId] uniqueidentifier NOT NULL,
        [ShipmentId] uniqueidentifier NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [Note] nvarchar(500) NOT NULL,
        [UpdatedByUserId] uniqueidentifier NOT NULL,
        [UpdatedByRole] nvarchar(40) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_ShipmentEvents] PRIMARY KEY ([ShipmentEventId]),
        CONSTRAINT [FK_ShipmentEvents_Shipments_ShipmentId] FOREIGN KEY ([ShipmentId]) REFERENCES [Shipments] ([ShipmentId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174620_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ShipmentEvents_ShipmentId] ON [ShipmentEvents] ([ShipmentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174620_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Shipments_ShipmentNumber] ON [Shipments] ([ShipmentNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260328174620_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260328174620_InitialCreate', N'10.0.5');
END;

COMMIT;
GO

