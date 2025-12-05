FROM golang:1.25 AS tests

WORKDIR /app/tests

COPY go.mod go.sum ./
RUN go mod download

RUN go install gotest.tools/gotestsum@latest

COPY etc ./etc
COPY *.go ./

CMD ["gotestsum", "--format", "testname"]

FROM golang:1.25 AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./

RUN CGO_ENABLED=0 GOOS=linux go build -o api .

FROM gcr.io/distroless/static:nonroot AS runtime

WORKDIR /app

COPY --from=build /app/api .

COPY etc ./etc

CMD ["./api"]
