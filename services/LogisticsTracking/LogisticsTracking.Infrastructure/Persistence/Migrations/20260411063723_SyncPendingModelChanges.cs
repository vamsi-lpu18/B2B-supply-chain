using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LogisticsTracking.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SyncPendingModelChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "AssignmentDecisionAtUtc",
                table: "Shipments",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssignmentDecisionReason",
                table: "Shipments",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssignmentDecisionStatus",
                table: "Shipments",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssignmentDecisionAtUtc",
                table: "Shipments");

            migrationBuilder.DropColumn(
                name: "AssignmentDecisionReason",
                table: "Shipments");

            migrationBuilder.DropColumn(
                name: "AssignmentDecisionStatus",
                table: "Shipments");
        }
    }
}
