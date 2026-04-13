using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LogisticsTracking.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddShipmentAgentRating : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DeliveryAgentRatedAtUtc",
                table: "Shipments",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeliveryAgentRatedByUserId",
                table: "Shipments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DeliveryAgentRating",
                table: "Shipments",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryAgentRatingComment",
                table: "Shipments",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeliveryAgentRatedAtUtc",
                table: "Shipments");

            migrationBuilder.DropColumn(
                name: "DeliveryAgentRatedByUserId",
                table: "Shipments");

            migrationBuilder.DropColumn(
                name: "DeliveryAgentRating",
                table: "Shipments");

            migrationBuilder.DropColumn(
                name: "DeliveryAgentRatingComment",
                table: "Shipments");
        }
    }
}
