import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  it("renderiza o título da aplicação BuildSmart V2", () => {
    render(<Home />);
    expect(screen.getByTestId("app-title")).toHaveTextContent("BuildSmart V2");
  });
});
