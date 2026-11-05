import {
  Body,
  Button,
  Container,
  Heading,
  Html,
  Img,
  Text,
} from "@react-email/components";

export interface NewProductNotificationProps {
  productTitle: string;
  productImageUrl?: string | null;
  productUrl: string;
  intro: string;
  buttonLabel: string;
  unsubscribeUrl: string;
  unsubscribeLabel: string;
}

const body = {
  backgroundColor: "#f6f6f7",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: "24px 0",
};

const container = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: "600px",
  padding: "24px 16px 32px",
  width: "100%",
};

const image = {
  display: "block",
  height: "auto",
  margin: "0 auto 16px",
  maxWidth: "600px",
  width: "100%",
};

const heading = {
  color: "#111213",
  fontSize: "24px",
  fontWeight: 700,
  lineHeight: "1.3",
  margin: "0 0 12px",
  textAlign: "center" as const,
};

const text = {
  color: "#202223",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 24px",
  textAlign: "center" as const,
};

const button = {
  backgroundColor: "#111213",
  borderRadius: "8px",
  color: "#ffffff",
  display: "block",
  fontSize: "16px",
  lineHeight: "1",
  margin: "0 auto",
  maxWidth: "240px",
  padding: "14px 24px",
  textAlign: "center" as const,
  textDecoration: "none",
};

export function NewProductNotification({
  productTitle,
  productImageUrl,
  productUrl,
  intro,
  buttonLabel,
  unsubscribeUrl,
  unsubscribeLabel,
}: NewProductNotificationProps) {
  return (
    <Html>
      <Body style={body}>
        <Container style={container}>
          {productImageUrl ? (
            <Img
              src={productImageUrl}
              alt={productTitle}
              width="600"
              style={image}
            />
          ) : null}
          <Heading style={heading}>{productTitle}</Heading>
          <Text style={text}>{intro}</Text>
          <Button href={productUrl} style={button}>
            {buttonLabel}
          </Button>
          <Text style={{ ...text, fontSize: "13px", margin: "24px 0 0" }}>
            <a href={unsubscribeUrl} style={{ color: "#616161" }}>
              {unsubscribeLabel}
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default NewProductNotification;
