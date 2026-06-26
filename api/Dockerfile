# ---- build ----
FROM golang@sha256:32c0e6e5c4f6707717051091b4d0b077464a679eaab563e11474efc5328e2aa5 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server .

# ---- runtime ----
FROM gcr.io/distroless/static@sha256:3592aa8171c77482f62bbc4164e6a2d141c6122554ace66e5cc910cadb961ff0
COPY --from=build /server /server
EXPOSE 8080
ENTRYPOINT ["/server"]